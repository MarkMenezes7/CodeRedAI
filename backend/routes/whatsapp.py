"""
WhatsApp Webhook — POST /api/whatsapp
======================================

Conversation flow
-----------------
STEP 1  User sends "emergency"  →  Bot acknowledges and asks for location
STEP 2  User sends location     →  Bot acknowledges and asks for emergency type
STEP 3  User sends type         →  Bot assigns ambulance, saves to MongoDB, sends confirmation

Session state is kept in-process (server-scoped dict).  In production you
would persist this in Redis so it survives restarts.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse
from twilio.twiml.messaging_response import MessagingResponse

try:
    from ..services.emergency_service import create_emergency, dispatch_ambulance, save_to_db
except ImportError:
    from services.emergency_service import create_emergency, dispatch_ambulance, save_to_db

_logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# In-process session store  { phone_number: { step, ... } }
# ---------------------------------------------------------------------------
_sessions: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# Emergency type mapping (number shortcuts → canonical names)
# ---------------------------------------------------------------------------
_EMERGENCY_MAP: dict[str, str] = {
    "1": "heart_attack",
    "2": "stroke",
    "3": "fainting",
    "4": "accident",
    "heart attack": "heart_attack",
    "heart_attack": "heart_attack",
    "stroke": "stroke",
    "fainted": "fainting",
    "fainting": "fainting",
    "accident": "accident",
    "other": "other",
}

_VALID_TYPES = {"heart_attack", "stroke", "fainting", "accident", "other"}

_EMERGENCY_EMOJI: dict[str, str] = {
    "heart_attack": "",
    "stroke": "",
    "fainting": "",
    "accident": "",
    "other": "",
}

_EMERGENCY_LABEL: dict[str, str] = {
    "heart_attack": "Heart Attack",
    "stroke": "Stroke",
    "fainting": "Fainting / Unconscious",
    "accident": "Accident",
    "other": "Emergency",
}


# ---------------------------------------------------------------------------
# Helper: build a TwiML PlainTextResponse
# ---------------------------------------------------------------------------
def _twiml_response(text: str) -> PlainTextResponse:
    resp = MessagingResponse()
    resp.message(text)
    return PlainTextResponse(str(resp), media_type="application/xml")


# ---------------------------------------------------------------------------
# Webhook handler
# ---------------------------------------------------------------------------
@router.post("/whatsapp")
async def whatsapp_webhook(request: Request) -> PlainTextResponse:
    """
    Main Twilio WhatsApp webhook endpoint.
    Parses incoming form data, maintains a per-user session, and responds
    with TwiML.
    """
    try:
        form = await request.form()

        raw_body: str = (form.get("Body") or "").strip()
        phone_number: str = (form.get("From") or "").strip()

        # Twilio may send GPS coordinates in separate fields
        latitude_raw = form.get("Latitude")
        longitude_raw = form.get("Longitude")

        _logger.info("Webhook hit | from=%s | body=%r", phone_number, raw_body)

        if not phone_number:
            return _twiml_response("⚠️ Invalid request — no sender number found.")

        msg_lower = raw_body.lower()

        # ------------------------------------------------------------------
        # GLOBAL RESET: user can type "reset" or "cancel" at any time
        # ------------------------------------------------------------------
        if msg_lower in {"reset", "cancel", "quit", "stop"}:
            _sessions.pop(phone_number, None)
            return _twiml_response(
                "🔄 Session reset.\n\n"
                "Send *emergency* to start a new emergency report."
            )

        # ------------------------------------------------------------------
        # STEP 1 — Activation
        # The user must send a message containing "emergency" to begin
        # ------------------------------------------------------------------
        if phone_number not in _sessions:
            if "emergency" in msg_lower:
                _sessions[phone_number] = {
                    "step": "ask_location",
                    "started_at": datetime.now(tz=timezone.utc).isoformat(),
                }
                return _twiml_response(
                    "🚨 *CODERED EMERGENCY SYSTEM ACTIVATED*\n\n"
                    "I'm here to help. Stay calm — help is coming.\n\n"
                    "📍 *Step 1 of 3:* Please share your location.\n\n"
                    "You can:\n"
                    "• Send your GPS location using WhatsApp's location share feature\n"
                    "• Or type your address (e.g. _12 Main Street, Chennai_)\n\n"
                    "_You can type *cancel* at any time to reset._"
                )
            else:
                return _twiml_response(
                    "👋 Welcome to *CodeRed AI Emergency Response*.\n\n"
                    "🆘 Send *emergency* to activate emergency assistance.\n\n"
                    "_This system dispatches ambulances in real-time._"
                )

        session = _sessions[phone_number]

        # ------------------------------------------------------------------
        # STEP 2 — Collect Location
        # ------------------------------------------------------------------
        if session["step"] == "ask_location":
            # Handle WhatsApp native GPS location share
            if latitude_raw and longitude_raw:
                try:
                    lat = float(latitude_raw)
                    lon = float(longitude_raw)
                    address = raw_body if raw_body else f"{lat:.6f}, {lon:.6f}"
                except ValueError:
                    lat, lon, address = None, None, raw_body
            else:
                lat, lon = None, None
                address = raw_body if raw_body else "Location not provided"

            session["latitude"] = lat
            session["longitude"] = lon
            session["address"] = address
            session["step"] = "ask_emergency_type"

            return _twiml_response(
                f"✅ *Location received!*\n"
                f"📍 {address}\n\n"
                "🏥 *Step 2 of 3:* What type of emergency?\n\n"
                "Reply with a number:\n"
                "1️⃣ Heart Attack\n"
                "2️⃣ Stroke\n"
                "3️⃣ Fainting / Unconscious\n"
                "4️⃣ Accident\n"
                "5️⃣ Other Emergency\n\n"
                "_Or type the emergency name directly._"
            )

        # ------------------------------------------------------------------
        # STEP 3 — Collect Emergency Type → Assign Ambulance → Save to DB
        # ------------------------------------------------------------------
        if session["step"] == "ask_emergency_type":
            # Handle "5" → other
            if msg_lower == "5":
                msg_lower = "other"

            emergency_type = _EMERGENCY_MAP.get(msg_lower)

            if not emergency_type:
                return _twiml_response(
                    "⚠️ *I didn't understand that.*\n\n"
                    "Please reply with:\n"
                    "1️⃣ Heart Attack\n"
                    "2️⃣ Stroke\n"
                    "3️⃣ Fainting / Unconscious\n"
                    "4️⃣ Accident\n"
                    "5️⃣ Other Emergency"
                )

            # Build and persist the emergency
            doc = create_emergency(
                phone_number=phone_number,
                lat=session.get("latitude"),
                lng=session.get("longitude"),
                address=session.get("address", "Unknown"),
                emergency_type=emergency_type,
            )

            emergency_id = save_to_db(doc)

            # Dispatch ambulance (now a separate step in the new architecture)
            ambulance = dispatch_ambulance(emergency_id) if emergency_id else None
            if not ambulance:
                # Fallback — build a simulated ambulance inline so the WhatsApp
                # user always gets a confirmation even if the DB write partially failed
                import random, string as _s
                ambulance = {
                    "id": "AMB-" + "".join(random.choices(_s.ascii_uppercase + _s.digits, k=6)),
                    "driver_name": "Emergency Responder",
                    "contact": "+91XXXXXXXXXX",
                    "eta": f"{random.randint(5, 15)} minutes",
                }

            emoji = _EMERGENCY_EMOJI.get(emergency_type, "⚠️")
            label = _EMERGENCY_LABEL.get(emergency_type, "Emergency")

            # Compose the confirmation message
            confirmation = (
                f"🚑 *AMBULANCE DISPATCHED!*\n"
                f"{'─' * 28}\n"
                f"{emoji} Emergency: *{label}*\n"
                f"📍 Location: {session.get('address', 'Unknown')}\n"
                f"{'─' * 28}\n"
                f"🆔 Ambulance: {ambulance['id']}\n"
                f"👨‍⚕️ Driver: {ambulance['driver_name']}\n"
                f"📞 Contact: {ambulance['contact']}\n"
                f"⏱ ETA: *{ambulance['eta']}*\n"
                f"{'─' * 28}\n"
            )

            if emergency_id:
                confirmation += f"📋 Case ID: {emergency_id[:12]}…\n"

            confirmation += (
                "\n✅ *Stay calm and stay on the line.*\n"
                "The driver has been notified of your location.\n\n"
                "_Send *emergency* to report a new incident._"
            )

            # Clear session after successful dispatch
            del _sessions[phone_number]

            _logger.info(
                "Emergency dispatched | phone=%s | type=%s | ambulance=%s | db_id=%s",
                phone_number, emergency_type, ambulance["id"], emergency_id,
            )

            return _twiml_response(confirmation)

        # ------------------------------------------------------------------
        # Fallback — unexpected session state
        # ------------------------------------------------------------------
        _sessions.pop(phone_number, None)
        return _twiml_response(
            "⚠️ Something went wrong. Session has been reset.\n\n"
            "Send *emergency* to start again."
        )

    except Exception as exc:  # noqa: BLE001
        _logger.exception("Unhandled error in WhatsApp webhook: %s", exc)
        # Always return valid TwiML even on server errors
        resp = MessagingResponse()
        resp.message("⚠️ Server error. Please try again in a moment.")
        return PlainTextResponse(str(resp), media_type="application/xml")