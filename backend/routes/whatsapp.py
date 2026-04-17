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
import re
from datetime import datetime, timezone
from urllib.parse import parse_qs

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse
from twilio.twiml.messaging_response import MessagingResponse

try:
    from ..services.emergency_service import create_emergency, save_to_db
    from ..services.hospital_service import find_nearest_hospitals, notify_hospitals
    from ..services.driver_service import find_nearest_drivers, create_driver_offers
except ImportError:
    from services.emergency_service import create_emergency, save_to_db
    from services.hospital_service import find_nearest_hospitals, notify_hospitals
    from services.driver_service import find_nearest_drivers, create_driver_offers

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
        content_type = (request.headers.get("content-type") or "").lower()
        raw_body: str = ""
        phone_number: str = ""
        latitude_raw = None
        longitude_raw = None

        # Twilio sends application/x-www-form-urlencoded by default.
        # Parse this path manually so the webhook works without python-multipart.
        if "application/x-www-form-urlencoded" in content_type:
            payload = parse_qs((await request.body()).decode("utf-8", errors="ignore"), keep_blank_values=True)

            raw_body = (payload.get("Body", [""])[0] or "").strip()
            phone_number = (payload.get("From", [""])[0] or "").strip()
            latitude_raw = payload.get("Latitude", [None])[0]
            longitude_raw = payload.get("Longitude", [None])[0]
        else:
            form = await request.form()
            raw_body = (form.get("Body") or "").strip()
            phone_number = (form.get("From") or "").strip()
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

                # Support manual coordinate input like: 19.0760, 72.8777
                coordinate_match = re.search(
                    r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)",
                    raw_body,
                )
                if coordinate_match:
                    try:
                        parsed_lat = float(coordinate_match.group(1))
                        parsed_lon = float(coordinate_match.group(2))
                        if -90 <= parsed_lat <= 90 and -180 <= parsed_lon <= 180:
                            lat, lon = parsed_lat, parsed_lon
                    except ValueError:
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

            # Standard flow: Geo-search hospitals AND drivers simultaneously
            lat = session.get("latitude")
            lng = session.get("longitude")
            
            hospitals = []
            drivers = []
            if emergency_id:
                if lat is not None and lng is not None:
                    # Parallel branch 1: Hospitals
                    hospitals = find_nearest_hospitals(lat, lng)
                    notify_hospitals(emergency_id, hospitals)

                    # Parallel branch 2: Drivers near the emergency
                    drivers = find_nearest_drivers(lat, lng)
                else:
                    # Location unavailable: still notify recently active drivers.
                    drivers = find_nearest_drivers(0.0, 0.0)

                create_driver_offers(emergency_id, drivers)

            emoji = _EMERGENCY_EMOJI.get(emergency_type, "⚠️")
            label = _EMERGENCY_LABEL.get(emergency_type, "Emergency")

            if hospitals or drivers:
                confirmation = (
                    f"🚨 *EMERGENCY RECORDED!*\n"
                    f"{'─' * 28}\n"
                    f"{emoji} Emergency: *{label}*\n"
                    f"📍 Location: {session.get('address', 'Unknown')}\n"
                    f"🏥 Hospitals Notified: *{len(hospitals)}*\n"
                    f"🚑 Drivers Notified: *{len(drivers)}*\n"
                    f"{'─' * 28}\n"
                )
                if emergency_id:
                    confirmation += f"📋 Case ID: {emergency_id[:12]}…\n\n"
                
                confirmation += (
                    "✅ *We have alerted the nearest hospitals and drivers.*\n"
                    "Please stay calm. An ambulance will be dispatched to your location the moment a driver accepts.\n\n"
                    "_Send *emergency* to report a new incident._"
                )
            else:
                confirmation = (
                    f"🚨 *EMERGENCY RECORDED!*\n"
                    f"{'─' * 28}\n"
                    f"{emoji} Emergency: *{label}*\n"
                    f"📍 Location: {session.get('address', 'Unknown')}\n"
                    f"{'─' * 28}\n"
                )
                if emergency_id:
                    confirmation += f"📋 Case ID: {emergency_id[:12]}…\n\n"
                
                confirmation += (
                    "⚠️ *Notice:* No active hospitals or drivers were found within 5 km of your location.\n"
                    "Our central dispatch team has been flagged and is attempting manual routing. Standard emergency services should also be contacted.\n\n"
                    "_Send *emergency* to report a new incident._"
                )

            # Clear session after successful dispatch
            del _sessions[phone_number]

            _logger.info(
                "Emergency recorded | phone=%s | type=%s | hospitals=%d | drivers=%d | db_id=%s",
                phone_number, emergency_type, len(hospitals), len(drivers), emergency_id,
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