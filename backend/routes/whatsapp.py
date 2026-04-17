from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse
from twilio.twiml.messaging_response import MessagingResponse

router = APIRouter()

user_sessions = {}

@router.post("/whatsapp")
async def whatsapp_webhook(request: Request):
    try:
        form = await request.form()

        user_msg = form.get("Body") or ""
        user_number = form.get("From") or ""

        user_msg = user_msg.strip()

        print("Webhook HIT")
        print("From:", user_number)
        print("Message:", user_msg)

        resp = MessagingResponse()
        msg = resp.message()

        if not user_number:
            msg.body("⚠️ Invalid request")
            return PlainTextResponse(str(resp), media_type="application/xml")

        # STEP 1
        if user_number not in user_sessions:
            user_sessions[user_number] = {"step": "ask_location"}
            msg.body("🚨 Emergency detected!\nPlease share your location 📍")

        # STEP 2
        elif user_sessions[user_number]["step"] == "ask_location":
            user_sessions[user_number]["location"] = user_msg
            user_sessions[user_number]["step"] = "ask_emergency"

            msg.body(
                "🚑 Got your location!\n\n"
                "What is the emergency?\n\n"
                "1️⃣ Heart Attack\n"
                "2️⃣ Stroke\n"
                "3️⃣ Fainted\n"
                "4️⃣ Accident"
            )

        # STEP 3
        elif user_sessions[user_number]["step"] == "ask_emergency":
            emergency_map = {
                "1": "Heart Attack",
                "2": "Stroke",
                "3": "Fainted",
                "4": "Accident"
            }

            emergency = emergency_map.get(user_msg, user_msg)
            location = user_sessions[user_number].get("location", "Unknown")

            msg.body(
                f"🚑 Help is on the way!\n\n"
                f"Emergency: {emergency}\n"
                f"Location: {location}\n\n"
                f"Stay calm. Our team is responding."
            )

            del user_sessions[user_number]

        return PlainTextResponse(str(resp), media_type="application/xml")

    except Exception as e:
        print("ERROR:", str(e))

        resp = MessagingResponse()
        resp.message("⚠️ Server error. Try again.")

        return PlainTextResponse(str(resp), media_type="application/xml")