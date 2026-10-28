/*
 * HOSTFind backend.
 * Never place PAYSTACK_SECRET_KEY in browser JavaScript or HTML.
 * Payment initialization and verification happen on this server.
 *
 * Starter note: hostel records/contact details are currently in js/hostel-data.js.
 * Before launch, move authoritative listings and
 * manager contact details into a database and only return them after this
 * server has verified a matching successful transaction.
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const { backup } = require("./database");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname)));

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

app.get("/api/config", (req, res) => {
  // A public key is designed to be shared with the browser.
  res.json({ paystackPublicKey: PUBLIC_KEY });
});

app.post("/api/payments/initialize", async (req, res) => {
  try {
    if (!SECRET_KEY || !PUBLIC_KEY) {
      return res.status(503).json({ error: "Paystack keys are not configured. Copy .env.example to .env and add your keys." });
    }

    const { name, email, phone, hostelId, hostelName, location } = req.body || {};
    if (!name || !validEmail(email) || !phone || !hostelId || !hostelName || !location) {
      return res.status(400).json({ error: "Please provide valid student and hostel details." });
    }

    // GHS 35.00 unlock fee = 3500 pesewas. This is not hostel rent.
    const payload = {
      email,
      amount: 3500,
      currency: "GHS",
      callback_url: `${process.env.SITE_URL || `http://localhost:${PORT}`}/payment-success.html`,
      metadata: {
        custom_fields: [
          { display_name: "Student name", variable_name: "student_name", value: String(name).slice(0, 100) },
          { display_name: "Student phone", variable_name: "student_phone", value: String(phone).slice(0, 40) },
          { display_name: "Hostel ID", variable_name: "hostel_id", value: String(hostelId).slice(0, 50) },
          { display_name: "Hostel name", variable_name: "hostel_name", value: String(hostelName).slice(0, 120) },
          { display_name: "Location", variable_name: "location", value: String(location).slice(0, 80) },
          { display_name: "Unlock fee", variable_name: "unlock_fee", value: "GHS 35.00" }
        ]
      }
    };

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok || !result.status || !result.data?.authorization_url) {
      console.error("Paystack initialization failed:", result.message || response.status);
      return res.status(502).json({ error: "Could not start payment. Please try again." });
    }

    res.json({
      authorizationUrl: result.data.authorization_url,
      reference: result.data.reference
    });
  } catch (error) {
    console.error("Initialize payment error:", error);
    res.status(500).json({ error: "Unexpected server error while starting payment." });
  }
});

app.get("/api/payments/verify/:reference", async (req, res) => {
  try {
    if (!SECRET_KEY) return res.status(503).json({ error: "Paystack secret key is not configured." });

    const reference = String(req.params.reference || "");
    if (!/^[A-Za-z0-9._=-]{5,100}$/.test(reference)) {
      return res.status(400).json({ error: "Invalid transaction reference." });
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` }
    });
    const result = await response.json();

    if (!response.ok || !result.status || !result.data) {
      return res.status(502).json({ error: "Could not verify this payment. Please contact support before paying again." });
    }

    const transaction = result.data;
    const verified = transaction.status === "success" &&
      Number(transaction.amount) === 3500 &&
      transaction.currency === "GHS";

    if (!verified) {
      return res.status(402).json({ verified: false, error: "Payment is not verified as successful for GHS 35.00." });
    }

    /*
     * IMPORTANT PRODUCTION HARDENING:
     * 1. Persist reference + user + hostel ID in a database.
     * 2. Confirm metadata matches the requested hostel and logged-in/student session.
     * 3. Prevent reference reuse and rate-limit this endpoint.
     * 4. Return manager details from a server-side database only after verification.
     * This starter confirms amount/currency/status but does not yet have a database
     * or authenticated student account, so manager details are served by the
     * frontend after this endpoint confirms payment. Do not treat that as a
     * production-grade access-control system.
     */
    res.json({
      verified: true,
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      paidAt: transaction.paid_at
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({ error: "Unexpected server error while verifying payment." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`HOSTFind running at http://localhost:${PORT}`);
});



