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
const crypto = require("crypto");
const db = require("./database");
const { hostels } = require("./public/js/hostel-data");


// Admin authentication and security.
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const SQLiteStore = require("better-sqlite3-session-store")(session);


const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

const UNLOCK_FEE = 4700; // GH₵47.00 in pesewas
const CURRENCY = "GHS";



// Security headers.
app.use(helmet());

// Limit repeated administrator login attempts.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again in 15 minutes."
  }
});

// Persistent SQLite session storage.
const sessionStore = new SQLiteStore({
  client: db,
  expired: {
    clear: true,
    intervalMs: 15 * 60 * 1000
  }
});

// Administrator session configuration.
app.use(session({
  name: "hostfind_admin_session",
  secret: process.env.SESSION_SECRET || "",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 2 * 60 * 60 * 1000
  }
}));



app.use(express.json({ limit: "100kb" }));

// Block access to sensitive project files.
app.use((req, res, next) => {
  const requestedPath = req.path.toLowerCase();

  const privateFiles = [
    "/server.js",
    "/server-backup.js",
    "/database.js",
    "/hostfind.db",
    "/migrate-hostels.js",
    "/package.json",
    "/package-lock.json"
  ];

  const isPrivateFile = privateFiles.some(
    (file) =>
      requestedPath === file ||
      requestedPath.endsWith(file)
  );

  const isPrivateDirectory =
    requestedPath.startsWith("/node_modules/") ||
    requestedPath.startsWith("/.git/");

  if (isPrivateFile || isPrivateDirectory) {
    return res.sendStatus(404);
  }

  next();
});

app.use(express.static(path.join(__dirname, "public")));

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

app.get("/api/config", (req, res) => {
  // A public key is designed to be shared with the browser.
  res.json({ paystackPublicKey: PUBLIC_KEY });
});



// Retrieve all publicly listed hostels from the database.
app.get("/api/hostels", (req, res) => {
  try {
    const hostels = db.prepare(`
      SELECT
        id,
        name,
        location,
        price,
        room_type AS roomType,
        description,
        images_json AS images,
        video,
        amenities_json AS amenities,
        rules_json AS rules,
        availability_status AS availabilityStatus,
        availability_message AS availabilityMessage,
        landmarks,
        distance,
        is_verified AS isVerified,
        is_published AS isPublished
      FROM hostels
      WHERE is_published = 1
      ORDER BY id ASC
    `).all();

    const formattedHostels = hostels.map((hostel) => ({
      ...hostel,
      images: JSON.parse(hostel.images || "[]"),
      amenities: JSON.parse(hostel.amenities || "[]"),
      rules: JSON.parse(hostel.rules || "[]"),
      isVerified: Boolean(hostel.isVerified),
      isPublished: Boolean(hostel.isPublished)
    }));

    res.json(formattedHostels);
  } catch (error) {
    console.error("HOSTFind hostel loading error:", error);

    res.status(500).json({
      error: "Unable to load hostels."
    });
  }
});



// Initialize a payment and save its reference in SQLite.
app.post("/api/payments/initialize", async (req, res) => {
  try {
    if (!SECRET_KEY || !PUBLIC_KEY) {
      return res.status(503).json({
        error: "Paystack keys are not configured."
      });
    }

    const { name, email, phone, hostelId } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !validEmail(email) ||
      typeof phone !== "string" ||
      !phone.trim() ||
      hostelId === undefined ||
      hostelId === null ||
      !String(hostelId).trim()
    ) {
      return res.status(400).json({
        error: "Please provide valid student and hostel details."
      });
    }



    // Store only a hostel ID that exists in the public hostel listings.
    const hostelIdText = String(hostelId).trim();

if (!/^\d+$/.test(hostelIdText)) {
  return res.status(400).json({
    error: "Invalid hostel selection."
  });
}

// Confirm that the selected hostel exists in the official listing data.
const selectedHostel = hostels.find(
  (item) => String(item.id) === hostelIdText
);

if (!selectedHostel) {
  return res.status(400).json({
    error: "The selected hostel does not exist."
  });
}












    const reference = `HF-${crypto.randomUUID()}`;

    // The server, not the browser, determines the payment amount.
    const payload = {
      email: email.trim(),
      amount: UNLOCK_FEE,
      currency: CURRENCY,
      reference,
      callback_url: `${process.env.SITE_URL || `http://localhost:${PORT}`}/payment-success.html`,
      metadata: {
        custom_fields: [
          {
            display_name: "Student name",
            variable_name: "student_name",
            value: name.trim().slice(0, 100)
          },
          {
            display_name: "Student phone",
            variable_name: "student_phone",
            value: phone.trim().slice(0, 40)
          },
          {
            display_name: "Hostel ID",
            variable_name: "hostel_id",
            value: hostelIdText
          }
        ]
      }
    };

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok || !result.status || !result.data?.authorization_url) {
      console.error(
        "Paystack initialization failed:",
        result.message || response.status
      );

      return res.status(502).json({
        error: "Could not start payment. Please try again."
      });
    }

    // Save the transaction before sending the checkout URL to the browser.
    db.prepare(`
      INSERT INTO payments (
        reference,
        hostel_id,
        student_name,
        student_email,
        student_phone,
        amount,
        currency,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      reference,
      hostelIdText,
      name.trim().slice(0, 100),
      email.trim(),
      phone.trim().slice(0, 40),
      UNLOCK_FEE,
      CURRENCY
    );

    return res.json({
      authorizationUrl: result.data.authorization_url,
      reference
    });
  } catch (error) {
    console.error("Initialize payment error:", error);

    return res.status(500).json({
      error: "Unexpected server error while starting payment."
    });
  }
});


// Verify a payment directly with Paystack and match it to SQLite.
app.get("/api/payments/verify/:reference", async (req, res) => {
  try {
    if (!SECRET_KEY) {
      return res.status(503).json({
        error: "Paystack secret key is not configured."
      });
    }

    const reference = String(req.params.reference || "");

    if (!/^HF-[0-9a-f-]{36}$/i.test(reference)) {
      return res.status(400).json({
        error: "Invalid HOSTFind payment reference."
      });
    }

    const payment = db.prepare(`
      SELECT *
      FROM payments
      WHERE reference = ?
    `).get(reference);

    if (!payment) {
      return res.status(404).json({
        verified: false,
        error: "This payment reference was not found in HOSTFind."
      });
    }

    // Do not accept a reference that belongs to another payment amount.
    if (payment.amount !== UNLOCK_FEE || payment.currency !== CURRENCY) {
      return res.status(400).json({
        verified: false,
        error: "The saved payment amount or currency is invalid."
      });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.status || !result.data) {
      return res.status(502).json({
        verified: false,
        error: "Could not verify this payment. Please try again later."
      });
    }

    const transaction = result.data;

    const verified =
      transaction.status === "success" &&
      transaction.reference === payment.reference &&
      Number(transaction.amount) === payment.amount &&
      transaction.currency === payment.currency &&
      transaction.gateway_response !== "Declined";

    if (!verified) {
      return res.status(402).json({
        verified: false,
        error: "Payment has not been verified as successful for GH₵47.00."
      });
    }

    // Record successful verification without changing the hostel association.
    db.prepare(`
      UPDATE payments
      SET status = 'success',
          paid_at = COALESCE(paid_at, ?)
      WHERE reference = ?
    `).run(
      transaction.paid_at || new Date().toISOString(),
      reference
    );

    return res.json({
      verified: true,
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      paidAt: transaction.paid_at,
      hostelId: payment.hostel_id
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    return res.status(500).json({
      verified: false,
      error: "Unexpected server error while verifying payment."
    });
  }
});





// Return private hostel manager details after verifying the payment.
app.get("/api/hostels/:hostelId/manager", (req, res) => {
  try {
    const hostelId = String(req.params.hostelId);
    const reference = String(req.query.reference || "").trim();

    if (!/^\d+$/.test(hostelId) || !reference) {
      return res.status(400).json({
        error: "A valid hostel ID and payment reference are required."
      });
    }

    // Confirm that this exact transaction paid the correct unlock fee
    // for the requested hostel.
    const payment = db.prepare(`
      SELECT reference, hostel_id, amount, currency, status
      FROM payments
      WHERE reference = ?
        AND hostel_id = ?
        AND amount = ?
        AND currency = ?
        AND status = 'success'
      LIMIT 1
    `).get(reference, hostelId, UNLOCK_FEE, CURRENCY);

    if (!payment) {
      return res.status(403).json({
        error: "A verified payment for this hostel is required."
      });
    }





    // Retrieve private information from SQLite, not public JavaScript.
    const details = db.prepare(`
      SELECT
        manager_name AS managerName,
        manager_phone AS managerPhone,
        manager_whatsapp AS managerWhatsApp,
        manager_email AS managerEmail,
        momo_network AS momoNetwork,
        momo_name AS momoName,
        momo_number AS momoNumber,
        bank_name AS bankName,
        bank_account_name AS bankAccountName,
        bank_account_number AS bankAccountNumber
      FROM hostel_private_details
      WHERE hostel_id = ?
    `).get(hostelId);

console.log("HOSTFind manager details lookup:", {
  hostelId,
  foundRecord: Boolean(details),
  fields: details ? Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      value ? "PRESENT" : "EMPTY"
    ])
  ) : null
});





    if (!details) {
      return res.status(404).json({
        error: "Manager details have not been added for this hostel yet."
      });
    }

    return res.json({
      success: true,
      hostelId,
      details
    });
  } catch (error) {
    console.error("Manager details error:", error);

    return res.status(500).json({
      error: "Could not retrieve hostel manager details."
    });
  }
});



// --------------------------------------------------
// HOSTFind Admin Authentication
// --------------------------------------------------

const adminLoginPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HOSTFind Admin Login</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #0f172a;
      color: #f8fafc;
      font-family: Arial, sans-serif;
    }
    main {
      width: 100%;
      max-width: 400px;
      padding: 32px;
      border: 1px solid #334155;
      border-radius: 20px;
      background: #1e293b;
    }
    h1 { margin-top: 0; font-size: 25px; }
    p { color: #cbd5e1; line-height: 1.6; }
    label { display: block; margin-top: 18px; }
    input {
      width: 100%;
      margin-top: 8px;
      padding: 12px;
      border: 1px solid #475569;
      border-radius: 8px;
      background: #0f172a;
      color: white;
    }
    button {
      width: 100%;
      margin-top: 24px;
      padding: 13px;
      border: 0;
      border-radius: 8px;
      background: #fbbf24;
      color: #111827;
      font-weight: bold;
      cursor: pointer;
    }
    #message { color: #fca5a5; }
  </style>
</head>
<body>
  <main>
    <h1>HOSTFind Admin</h1>
    <p>Sign in to manage private hostel information.</p>
    <form id="loginForm">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password"
        autocomplete="current-password" required>
      <button type="submit">Sign in</button>
      <p id="message" role="alert"></p>
    </form>
  </main>


  <script src="/js/admin-login.js" defer></script>


</body>
</html>`;

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  return res.status(401).json({
    error: "Administrator login required."
  });
}

app.get("/admin/login", (req, res) => {
  if (req.session && req.session.isAdmin === true) {
    return res.redirect("/admin");
  }

  res.type("html").send(adminLoginPage);
});

app.post("/api/admin/login", adminLoginLimiter, (req, res, next) => {
  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const submittedUsername =
    typeof req.body?.username === "string" ? req.body.username : "";
  const submittedPassword =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !passwordHash || !process.env.SESSION_SECRET) {
    return res.status(503).json({
      error: "Administrator authentication is not configured."
    });
  }

  if (
    submittedUsername !== username ||
    !bcrypt.compareSync(submittedPassword, passwordHash)
  ) {
    return res.status(401).json({
      error: "Invalid username or password."
    });
  }

  req.session.regenerate((error) => {
    if (error) return next(error);

    req.session.isAdmin = true;

    req.session.save((saveError) => {
      if (saveError) return next(saveError);

      return res.json({ success: true });
    });
  });
});

app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({ authenticated: true });
});


// --------------------------------------------------
// HOSTFind Admin Statistics API
// Only authenticated administrators may access this.
// --------------------------------------------------

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  try {
    // Get the total number of public hostel listings.
    const hostelCount = hostels.length;

    // Count all private-detail records in SQLite.
    const privateRecordCount = db.prepare(`
      SELECT COUNT(*) AS total
      FROM hostel_private_details
    `).get().total;

    // Count records with at least one manager contact detail.
    const completedManagerCount = db.prepare(`
      SELECT COUNT(*) AS total
      FROM hostel_private_details
      WHERE
        TRIM(manager_name) <> ''
        OR TRIM(manager_phone) <> ''
        OR TRIM(manager_whatsapp) <> ''
        OR TRIM(manager_email) <> ''
    `).get().total;

    // Return only summary figures, not private information.
    res.json({
      success: true,
      stats: {
        hostelCount,
        privateRecordCount,
        completedManagerCount
      }
    });
  } catch (error) {
    console.error("HOSTFind admin statistics error:", error.message);

    res.status(500).json({
      error: "Unable to load dashboard statistics."
    });
  }
});


// --------------------------------------------------
// HOSTFind Admin Hostel Listings API
// Only authenticated administrators may access this.
// --------------------------------------------------

app.get("/api/admin/hostels", requireAdmin, (req, res) => {
  try {
    const hostels = db.prepare(`
      SELECT
        id,
        name,
        location,
        price,
        room_type AS roomType,
        description,
        images_json AS images,
        video,
        amenities_json AS amenities,
        availability_status AS availabilityStatus,
        availability_message AS availabilityMessage,
        rules_json AS rules,
        landmarks,
        distance,
        is_published AS isPublished,
        is_verified AS isVerified
      FROM hostels
      ORDER BY id ASC
    `).all();

    const formattedHostels = hostels.map((hostel) => ({
      ...hostel,
      images: JSON.parse(hostel.images || "[]"),
      amenities: JSON.parse(hostel.amenities || "[]"),
      rules: JSON.parse(hostel.rules || "[]"),
      isPublished: Boolean(hostel.isPublished),
      isVerified: Boolean(hostel.isVerified)
    }));

    return res.json({
      success: true,
      hostels: formattedHostels
    });
  } catch (error) {
    console.error(
      "HOSTFind admin hostel list error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to load admin hostel listings."
    });
  }
});



// --------------------------------------------------
// HOSTFind Admin: Create a New Hostel
// Only authenticated administrators may add hostels.
// --------------------------------------------------

app.post("/api/admin/hostels", requireAdmin, (req, res) => {
  try {
    const {
      name,
      location,
      price,
      roomType,
      description,
      images,
      video,
      amenities,
      availabilityStatus,
      availabilityMessage,
      rules,
      landmarks,
      distance,
      isPublished,
      isVerified
    } = req.body;

    // Validate required fields.
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof location !== "string" ||
      !location.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Hostel name and location are required."
      });
    }

    const parsedPrice = Number(price);

    if (
      price === undefined ||
      price === null ||
      price === "" ||
      !Number.isSafeInteger(parsedPrice) ||
      parsedPrice < 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Enter a valid hostel price."
      });
    }

    const validAvailabilityStatuses = [
      "available",
      "limited",
      "full",
      "not_verified"
    ];

    const status = availabilityStatus || "not_verified";

    if (!validAvailabilityStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid hostel availability status."
      });
    }

    // Ensure list fields are stored as valid JSON arrays.
    const toJsonArray = (value, fieldName) => {
      if (value === undefined || value === null) {
        return "[]";
      }

      if (!Array.isArray(value)) {
        throw new Error(`${fieldName} must be an array.`);
      }

      return JSON.stringify(value);
    };

    const imagesJson = toJsonArray(images, "Images");
    const amenitiesJson = toJsonArray(amenities, "Amenities");
    const rulesJson = toJsonArray(rules, "Rules");

    const result = db.prepare(`
      INSERT INTO hostels (
        name,
        location,
        price,
        room_type,
        description,
        images_json,
        video,
        amenities_json,
        availability_status,
        availability_message,
        rules_json,
        landmarks,
        distance,
        is_published,
        is_verified
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      location.trim(),
      parsedPrice,
      typeof roomType === "string" ? roomType.trim() : "",
      typeof description === "string" ? description.trim() : "",
      imagesJson,
      typeof video === "string" ? video.trim() : "",
      amenitiesJson,
      status,
      typeof availabilityMessage === "string"
        ? availabilityMessage.trim()
        : "",
      rulesJson,
      typeof landmarks === "string" ? landmarks.trim() : "",
      typeof distance === "string" ? distance.trim() : "",
      String(isPublished) === "0" ? 0 : 1,
String(isVerified) === "1" ? 1 : 0
    );

    const newHostel = db.prepare(`
      SELECT
        id,
        name,
        location,
        price,
        room_type AS roomType,
        description,
        images_json AS images,
        video,
        amenities_json AS amenities,
        availability_status AS availabilityStatus,
        availability_message AS availabilityMessage,
        rules_json AS rules,
        landmarks,
        distance,
        is_published AS isPublished,
        is_verified AS isVerified
      FROM hostels
      WHERE id = ?
    `).get(result.lastInsertRowid);

    newHostel.images = JSON.parse(newHostel.images || "[]");
    newHostel.amenities = JSON.parse(newHostel.amenities || "[]");
    newHostel.rules = JSON.parse(newHostel.rules || "[]");
    newHostel.isPublished = Boolean(newHostel.isPublished);
    newHostel.isVerified = Boolean(newHostel.isVerified);

    return res.status(201).json({
      success: true,
      message: "Hostel added successfully.",
      hostel: newHostel
    });
  } catch (error) {
    console.error("HOSTFind admin create-hostel error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to add hostel. Check the submitted details."
    });
  }
});


    // Update public information for an existing hostel.
app.put(
  "/api/admin/hostels/:hostelId",
  requireAdmin,
  (req, res) => {
    try {
      const hostelId = Number(req.params.hostelId);
      const body = req.body || {};

      // Validate the hostel ID.
      if (!Number.isSafeInteger(hostelId) || hostelId < 1) {
        return res.status(400).json({
          error: "Invalid hostel ID."
        });
      }

      // Confirm that the hostel exists in SQLite.
      const existingHostel = db.prepare(`
        SELECT id
        FROM hostels
        WHERE id = ?
      `).get(hostelId);

      if (!existingHostel) {
        return res.status(404).json({
          error: "Hostel listing not found."
        });
      }

      // Validate the hostel name.
      const name =
        typeof body.name === "string" ? body.name.trim() : "";

      if (!name || name.length > 150) {
        return res.status(400).json({
          error: "Enter a valid hostel name of up to 150 characters."
        });
      }

      // Validate the location.
      const location =
        typeof body.location === "string"
          ? body.location.trim()
          : "";

      if (!location || location.length > 150) {
        return res.status(400).json({
          error: "Enter a valid location of up to 150 characters."
        });
      }

      // Validate the price.
      const price = Number(body.price);

      if (
        body.price === "" ||
        body.price === null ||
        body.price === undefined ||
        !Number.isSafeInteger(price) ||
        price < 0
      ) {
        return res.status(400).json({
          error: "Price must be a non-negative whole number."
        });
      }

      // Validate availability.
      const allowedStatuses = [
        "available",
        "limited",
        "full",
        "not_verified"
      ];

      const availabilityStatus = body.availabilityStatus;

      if (!allowedStatuses.includes(availabilityStatus)) {
        return res.status(400).json({
          error: "Invalid hostel availability status."
        });
      }

      // Validate HOSTFind verification status.
      const isVerified =
        body.isVerified === true ||
        body.isVerified === 1 ||
        body.isVerified === "1"
          ? 1
          : body.isVerified === false ||
            body.isVerified === 0 ||
            body.isVerified === "0"
            ? 0
            : null;

      if (isVerified === null) {
        return res.status(400).json({
          error: "Select a valid verification status."
        });
      }

      // Validate publication status.
      const isPublished =
        body.isPublished === true ||
        body.isPublished === 1 ||
        body.isPublished === "1"
          ? 1
          : body.isPublished === false ||
            body.isPublished === 0 ||
            body.isPublished === "0"
            ? 0
            : null;

      if (isPublished === null) {
        return res.status(400).json({
          error: "Select a valid publication status."
        });
      }

      // Validate arrays used for images, amenities and rules.
      const validateStringArray = (
        value,
        fieldName,
        maxItems = 50
      ) => {
        if (!Array.isArray(value)) {
          throw new Error(`${fieldName} must be a list.`);
        }

        if (value.length > maxItems) {
          throw new Error(`${fieldName} contains too many items.`);
        }

        return value.map((item) => {
          if (typeof item !== "string") {
            throw new Error(`${fieldName} contains an invalid item.`);
          }

          const cleaned = item.trim();

          if (cleaned.length > 1000) {
            throw new Error(
              `An item in ${fieldName} exceeds 1000 characters.`
            );
          }

          return cleaned;
        }).filter(Boolean);
      };

      const images = validateStringArray(
        body.images,
        "Images",
        20
      );

      const amenities = validateStringArray(
        body.amenities,
        "Amenities",
        50
      );

      const rules = validateStringArray(
        body.rules,
        "House rules",
        50
      );

      // Validate and normalize text fields.
      const getText = (value, fieldName, maxLength) => {
        if (typeof value !== "string") {
          throw new Error(`${fieldName} must be text.`);
        }

        const cleaned = value.trim();

        if (cleaned.length > maxLength) {
          throw new Error(
            `${fieldName} cannot exceed ${maxLength} characters.`
          );
        }

        return cleaned;
      };

      const roomType = getText(
        body.roomType ?? "",
        "Room type",
        100
      );

      const description = getText(
        body.description ?? "",
        "Description",
        3000
      );

      const video = getText(
        body.video ?? "",
        "Video",
        1000
      );

      const availabilityMessage = getText(
        body.availabilityMessage ?? "",
        "Availability message",
        250
      );

      const landmarks = getText(
        body.landmarks ?? "",
        "Nearby landmarks",
        1000
      );

      const distance = getText(
        body.distance ?? "",
        "Distance information",
        250
      );

      // Update the existing SQLite record.
      const updateHostel = db.prepare(`
        UPDATE hostels
        SET
          name = ?,
          location = ?,
          price = ?,
          room_type = ?,
          description = ?,
          images_json = ?,
          video = ?,
          amenities_json = ?,
          availability_status = ?,
          availability_message = ?,
          rules_json = ?,
          landmarks = ?,
          distance = ?,
          is_published = ?,
          is_verified = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateHostel.run(
        name,
        location,
        price,
        roomType,
        description,
        JSON.stringify(images),
        video,
        JSON.stringify(amenities),
        availabilityStatus,
        availabilityMessage,
        JSON.stringify(rules),
        landmarks,
        distance,
        isPublished,
        isVerified,
        hostelId
      );

      return res.json({
        success: true,
        message: "Hostel listing updated successfully.",
        hostelId
      });

    } catch (error) {
      console.error(
        "HOSTFind hostel update error:",
        error.message
      );

      if (
        error.message.includes("must be") ||
        error.message.includes("exceeds") ||
        error.message.includes("too many") ||
        error.message.includes("cannot exceed")
      ) {
        return res.status(400).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: "Unable to update the hostel listing."
      });
    }
  }
);

// Retrieve private manager details for the authenticated administrator.
app.get(
  "/api/admin/hostels/:hostelId/manager",
  requireAdmin,
  (req, res) => {
    try {
      const hostelId = Number(req.params.hostelId);

      // Confirm that the requested ID belongs to an existing hostel.
      if (
        !Number.isSafeInteger(hostelId) ||
        !hostels.some((hostel) => hostel.id === hostelId)
      ) {
        return res.status(400).json({
          error: "Invalid hostel ID."
        });
      }

      // Retrieve the private record from SQLite.
      const details = db.prepare(`
        SELECT
          hostel_id AS hostelId,
          manager_name AS managerName,
          manager_phone AS managerPhone,
          manager_whatsapp AS managerWhatsApp,
          manager_email AS managerEmail,
          momo_network AS momoNetwork,
          momo_name AS momoName,
          momo_number AS momoNumber,
          bank_name AS bankName,
          bank_account_name AS bankAccountName,
          bank_account_number AS bankAccountNumber
        FROM hostel_private_details
        WHERE hostel_id = ?
      `).get(hostelId);

      // Return an empty form if no private record exists yet.
      if (!details) {
        return res.json({
          success: true,
          hostelId,
          details: {
            managerName: "",
            managerPhone: "",
            managerWhatsApp: "",
            managerEmail: "",
            momoNetwork: "",
            momoName: "",
            momoNumber: "",
            bankName: "",
            bankAccountName: "",
            bankAccountNumber: ""
          }
        });
      }

      return res.json({
        success: true,
        hostelId,
        details
      });
    } catch (error) {
      console.error(
        "HOSTFind admin manager lookup error:",
        error.message
      );

      return res.status(500).json({
        error: "Unable to retrieve manager details."
      });
    }
  }
);


// Save or update private manager details for an existing hostel.
app.put(
  "/api/admin/hostels/:hostelId/manager",
  requireAdmin,
  (req, res) => {
    try {
      const hostelId = Number(req.params.hostelId);

      // Confirm that the hostel exists.
      if (
        !Number.isSafeInteger(hostelId) ||
        !hostels.some((hostel) => hostel.id === hostelId)
      ) {
        return res.status(400).json({
          error: "Invalid hostel ID."
        });
      }

      const fields = [
        ["managerName", "manager_name", 150],
        ["managerPhone", "manager_phone", 30],
        ["managerWhatsApp", "manager_whatsapp", 30],
        ["managerEmail", "manager_email", 254],
        ["momoNetwork", "momo_network", 50],
        ["momoName", "momo_name", 150],
        ["momoNumber", "momo_number", 30],
        ["bankName", "bank_name", 100],
        ["bankAccountName", "bank_account_name", 150],
        ["bankAccountNumber", "bank_account_number", 50]
      ];

      const values = {};

      console.log("HOSTFind manager save request:", {
  hostelId: req.params.hostelId,
  contentType: req.headers["content-type"],
  bodyKeys: Object.keys(req.body || {}),
  submittedFields: Object.fromEntries(
    fields.map(([inputName]) => [
      inputName,
      typeof req.body?.[inputName] === "string" &&
      req.body[inputName].trim() !== ""
        ? "PRESENT"
        : "EMPTY OR MISSING"
    ])
  )
});

      // Validate and normalize every submitted field.
      for (const [inputName, , maxLength] of fields) {
        const value = req.body?.[inputName];

        if (value === undefined || value === null) {
          values[inputName] = "";
          continue;
        }

        if (typeof value !== "string") {
          return res.status(400).json({
            error: `Invalid value for ${inputName}.`
          });
        }

        const normalizedValue = value.trim();

        if (normalizedValue.length > maxLength) {
          return res.status(400).json({
            error: `${inputName} must not exceed ${maxLength} characters.`
          });
        }

        values[inputName] = normalizedValue;
      }

      // Validate email only when one has been provided.
      if (
        values.managerEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.managerEmail)
      ) {
        return res.status(400).json({
          error: "Enter a valid manager email address."
        });
      }

      // Insert a new record or update the existing hostel record.
      const saveDetails = db.prepare(`
        INSERT INTO hostel_private_details (
          hostel_id,
          manager_name,
          manager_phone,
          manager_whatsapp,
          manager_email,
          momo_network,
          momo_name,
          momo_number,
          bank_name,
          bank_account_name,
          bank_account_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(hostel_id) DO UPDATE SET
          manager_name = excluded.manager_name,
          manager_phone = excluded.manager_phone,
          manager_whatsapp = excluded.manager_whatsapp,
          manager_email = excluded.manager_email,
          momo_network = excluded.momo_network,
          momo_name = excluded.momo_name,
          momo_number = excluded.momo_number,
          bank_name = excluded.bank_name,
          bank_account_name = excluded.bank_account_name,
          bank_account_number = excluded.bank_account_number
      `);
const saveTransaction = db.transaction(() => {
  saveDetails.run(
    String(hostelId),
    ...fields.map(([inputName]) => values[inputName])
  );

  const savedRecord = db.prepare(`
    SELECT
      manager_name,
      manager_phone,
      manager_whatsapp,
      manager_email
    FROM hostel_private_details
    WHERE hostel_id = ?
  `).get(String(hostelId));

  if (
    !savedRecord ||
    savedRecord.manager_name !== values.managerName ||
    savedRecord.manager_phone !== values.managerPhone ||
    savedRecord.manager_whatsapp !== values.managerWhatsApp ||
    savedRecord.manager_email !== values.managerEmail
  ) {
    throw new Error("Manager details could not be verified after saving.");
  }
});

saveTransaction();
      



      return res.json({
        success: true,
        message: "Manager details saved successfully."
      });
    } catch (error) {
      console.error(
        "HOSTFind save manager details error:",
        error.message
      );

      return res.status(500).json({
        error: "Unable to save manager details."
      });
    }
  }
);



app.post("/api/admin/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("hostfind_admin_session");
    res.json({ success: true });
  });
});

// --------------------------------------------------
// HOSTFind Protected Admin Dashboard
// --------------------------------------------------

app.get("/admin", (req, res) => {
  if (!req.session || req.session.isAdmin !== true) {
    return res.redirect("/admin/login");
  }

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Secure HOSTFind administrator dashboard">
  <title>HOSTFind | Admin Dashboard</title>

  <style>
  :root {
    --primary: #1e3a8a;
    --primary-dark: #14295f;
    --primary-light: #dbeafe;
    --gold: #fbbf24;
    --gold-light: #fef3c7;

    --background: #eef4ff;
    --surface: rgba(255, 255, 255, 0.76);
    --surface-strong: rgba(255, 255, 255, 0.94);

    --text: #14213d;
    --muted: #64748b;
    --border: rgba(148, 163, 184, 0.25);

    --success: #15803d;
    --danger: #b42318;

    --radius: 20px;
    --shadow:
      0 12px 35px rgba(30, 58, 138, 0.08),
      0 2px 8px rgba(15, 23, 42, 0.03);
  }

  * {
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    min-height: 100vh;
    background:
      radial-gradient(
        circle at 8% 5%,
        rgba(191, 219, 254, 0.85),
        transparent 32%
      ),
      radial-gradient(
        circle at 95% 20%,
        rgba(253, 230, 138, 0.34),
        transparent 25%
      ),
      linear-gradient(145deg, #f8fbff 0%, #edf3ff 55%, #f8fafc 100%);
    background-attachment: fixed;
    color: var(--text);
    font-family:
      Inter, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 3px solid rgba(251, 191, 36, 0.7);
    outline-offset: 3px;
  }

  /* Top navigation */

  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;

    padding: 17px 5%;

    background: rgba(20, 41, 95, 0.94);
    color: #fff;

    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 30px rgba(15, 23, 42, 0.12);

    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
  }

  .brand {
    font-size: 23px;
    font-weight: 850;
    letter-spacing: -0.9px;
  }

  .brand span {
    color: var(--gold);
  }

  .admin-label {
    margin-top: 3px;
    color: #cbd5e1;
    font-size: 12px;
    letter-spacing: 0.3px;
  }

  .logout-button {
    padding: 10px 17px;

    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 11px;

    background: rgba(255, 255, 255, 0.07);
    color: #fff;

    font-weight: 650;
    transition:
      background 180ms ease,
      transform 180ms ease,
      border-color 180ms ease;
  }

  .logout-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-1px);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  /* Main content */

  .container {
    width: min(1180px, 92%);
    margin: 38px auto;
  }

  .welcome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 30px;
  }

  .welcome h1 {
    margin: 0 0 9px;
    font-size: clamp(27px, 4vw, 38px);
    font-weight: 850;
    letter-spacing: -1.5px;
    line-height: 1.2;
  }

  .welcome p {
    max-width: 650px;
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.8;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 9px;

    padding: 10px 14px;

    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 999px;

    background: rgba(240, 253, 244, 0.85);
    color: var(--success);

    font-size: 12px;
    font-weight: 750;
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;

    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
  }

  /* Dashboard statistics */

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .stat-card {
    position: relative;
    overflow: hidden;

    padding: 25px;

    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: var(--radius);

    background: var(--surface);
    box-shadow: var(--shadow);

    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);

    transition:
      transform 200ms ease,
      box-shadow 200ms ease,
      border-color 200ms ease;
  }

  .stat-card::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;

    width: 100%;
    height: 4px;

    background: linear-gradient(
      90deg,
      var(--primary),
      #60a5fa,
      var(--gold)
    );
  }

  .stat-card:hover {
    transform: translateY(-4px);
    border-color: rgba(96, 165, 250, 0.45);
    box-shadow: 0 18px 42px rgba(30, 58, 138, 0.12);
  }

  .stat-label {
    color: var(--muted);
    font-size: 13px;
    font-weight: 650;
  }

  .stat-value {
    margin-top: 13px;
    color: var(--primary);
    font-size: 36px;
    font-weight: 850;
    letter-spacing: -1.5px;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  .stat-note {
    margin-top: 11px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.7;
  }

  /* General dashboard panels */

  .panel,
  .manager-management {
    margin-bottom: 26px;
    overflow: hidden;

    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: var(--radius);

    background: var(--surface);
    box-shadow: var(--shadow);

    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
  }

  .panel-header,
  .section-heading {
    padding: 25px 27px;

    border-bottom: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.38);
  }

  .panel-header h2,
  .section-heading h2 {
    margin: 0 0 8px;
    color: var(--text);
    font-size: 21px;
    font-weight: 800;
    letter-spacing: -0.55px;
  }

  .panel-header p,
  .section-heading p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.8;
  }

  .panel-body {
    padding: 27px;
  }

  /* Notice and action cards */

  .notice {
    padding: 19px;

    border: 1px solid rgba(251, 191, 36, 0.45);
    border-radius: 15px;

    background: rgba(255, 251, 235, 0.85);
    color: #92400e;

    font-size: 13px;
    line-height: 1.8;
  }

  .notice strong {
    display: block;
    margin-bottom: 5px;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-top: 22px;
  }

  .action-card {
    padding: 22px;

    border: 1px solid var(--border);
    border-radius: 16px;

    background: rgba(255, 255, 255, 0.65);

    transition:
      border-color 180ms ease,
      transform 180ms ease,
      box-shadow 180ms ease;
  }

  .action-card:hover {
    transform: translateY(-2px);
    border-color: rgba(96, 165, 250, 0.5);
    box-shadow: 0 10px 25px rgba(30, 58, 138, 0.07);
  }

  .action-card h3 {
    margin: 0 0 9px;
    font-size: 16px;
    font-weight: 750;
  }

  .action-card p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.8;
  }

  /* Manager information form */

  .manager-management {
    padding: 0;
  }

  .manager-management form {
    padding: 27px;
  }

  .manager-management form h3 {
    margin: 30px 0 17px;
    padding-bottom: 11px;

    border-bottom: 1px solid var(--border);

    color: var(--primary);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.2px;
  }

  .manager-management form h3:first-of-type {
    margin-top: 28px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin-bottom: 18px;
  }

  .form-group label {
    color: #334155;
    font-size: 13px;
    font-weight: 700;
  }

  .form-group input,
  .form-group select,
  #managerHostelSelect {
    width: 100%;
    min-height: 47px;
    padding: 12px 14px;

    border: 1px solid #d7e0ef;
    border-radius: 12px;

    background: rgba(255, 255, 255, 0.86);
    color: var(--text);

    font-size: 14px;

    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      background 180ms ease;
  }

  .form-group input::placeholder {
    color: #94a3b8;
  }

  .form-group input:hover,
  .form-group select:hover,
  #managerHostelSelect:hover {
    border-color: #a5bfe8;
  }

  .form-group input:focus,
  .form-group select:focus,
  #managerHostelSelect:focus {
    border-color: #3b82f6;
    outline: none;
    background: #fff;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
  }

  #managerHostelSelect {
    max-width: 100%;
    margin-top: 8px;
    cursor: pointer;
  }

  .form-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;

    margin-top: 26px;
    padding-top: 23px;

    border-top: 1px solid var(--border);
  }

  #saveManagerDetailsButton {
    min-height: 47px;
    padding: 12px 22px;

    border: 1px solid transparent;
    border-radius: 12px;

    background: linear-gradient(135deg, #1e40af, #1e3a8a);
    color: #fff;

    font-size: 13px;
    font-weight: 750;

    box-shadow: 0 7px 18px rgba(30, 58, 138, 0.2);

    transition:
      transform 180ms ease,
      box-shadow 180ms ease,
      filter 180ms ease;
  }

  #saveManagerDetailsButton:hover:not(:disabled) {
    transform: translateY(-2px);
    filter: brightness(1.08);
    box-shadow: 0 11px 24px rgba(30, 58, 138, 0.26);
  }

  #managerFormMessage {
    min-height: 20px;
    font-size: 13px;
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  /* Footer */

  .footer {
    padding: 26px 10px 14px;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
    line-height: 1.9;
  }

  /* Tablet and mobile layouts */

  @media (max-width: 850px) {
    .container {
      width: 94%;
    }

    .stats {
      gap: 14px;
    }

    .stat-card {
      padding: 20px;
    }

    .stat-value {
      font-size: 31px;
    }
  }

  @media (max-width: 650px) {
    .topbar {
      padding: 15px 4%;
      gap: 12px;
    }

    .brand {
      font-size: 21px;
    }

    .logout-button {
      padding: 9px 12px;
      font-size: 12px;
    }

    .container {
      width: 92%;
      margin-top: 25px;
    }

    .welcome {
      align-items: flex-start;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 23px;
    }

    .welcome h1 {
      font-size: 29px;
    }

    .stats {
      grid-template-columns: 1fr;
      gap: 13px;
      margin-bottom: 23px;
    }

    .stat-card {
      padding: 22px;
    }

    .stat-value {
      font-size: 30px;
    }

    .actions,
    .form-grid {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .panel-header,
    .section-heading,
    .panel-body,
    .manager-management form {
      padding: 20px;
    }

    .panel-header h2,
    .section-heading h2 {
      font-size: 19px;
    }

    .manager-management form h3 {
      margin-top: 25px;
    }

    .form-actions {
      align-items: stretch;
      flex-direction: column;
    }

    #saveManagerDetailsButton {
      width: 100%;
    }
  }

  /* Respect reduced-motion preferences. */

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>

</head>

<body>
  <header class="topbar">
    <div>
      <div class="brand">HOST<span>Find</span></div>
      <div class="admin-label">Administration Portal</div>
    </div>

    <button class="logout-button" id="logoutButton" type="button">
      Log out
    </button>
  </header>

  <main class="container">
    <section class="welcome">
      <div>
        <h1>Admin Dashboard</h1>
        <p>Manage hostel listings and private manager information.</p>
      </div>

      <div class="status">
        <span class="status-dot"></span>
        Authenticated session
      </div>
    </section>

    <section class="stats" aria-label="Dashboard overview">
      <article class="stat-card">
        <div class="stat-label">Hostel Listings</div>
        <div class="stat-value" id="hostelCount">—</div>
        <div class="stat-note">
          Existing hostel records. We will connect this figure to SQLite.
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-label">Private Detail Records</div>
        <div class="stat-value" id="privateRecordCount">—</div>
        <div class="stat-note">
          Database records exist, but their manager information is not yet populated.
        </div>
      </article>

      <article class="stat-card">
  <div class="stat-label">Manager Details Collected</div>
  <div class="stat-value" id="completedManagerCount">—</div>
  <div class="stat-note">
    Hostel records with manager contact information entered.
  </div>
</article>

</section>




<!-- Manage public hostel listings -->
<section class="manager-management" aria-labelledby="hostelManagementTitle">
  <div class="section-heading">
    <h2 id="hostelManagementTitle">Hostel Management</h2>
    <p>
      Search, review, add and edit hostel listings displayed on the public website.
    </p>
  </div>

  <div class="form-group">
    <label for="hostelSearch">Search Hostels</label>
    <input
      id="hostelSearch"
      type="search"
      placeholder="Search by hostel name or location..."
      autocomplete="off"
    >
  </div>

  <div class="table-responsive">
    <table class="hostel-management-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Hostel Name</th>
          <th>Location</th>
          <th>Price (GH₵)</th>
          <th>Room Type</th>
          <th>Availability</th>
          <th>Published</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody id="hostelManagementTableBody">
        <tr>
          <td colspan="8">Loading hostel listings...</td>
        </tr>
      </tbody>
    </table>
  </div>

  <p id="hostelManagementMessage" role="status" aria-live="polite"></p>

  <button type="button" id="addHostelButton" class="primary-button">
    + Add New Hostel
  </button>
</section>



<!-- Add or edit a public hostel listing -->

<section
  class="manager-management"
  id="hostelEditorSection"
  aria-labelledby="hostelEditorTitle"
  hidden
>
  <div class="section-heading">
    <h2 id="hostelEditorTitle">Edit Hostel Listing</h2>
    <p>Update the hostel's public information below.</p>
  </div>

  <form id="hostelEditorForm">
    <input type="hidden" id="editHostelId" name="id">

    <div class="form-grid">
      <div class="form-group">
        <label for="editHostelName">Hostel Name *</label>
        <input
          id="editHostelName"
          name="name"
          type="text"
          maxlength="150"
          required
        >
      </div>

      <div class="form-group">
        <label for="editHostelLocation">Location *</label>
        <input
          id="editHostelLocation"
          name="location"
          type="text"
          maxlength="150"
          required
        >
      </div>

      <div class="form-group">
        <label for="editHostelPrice">Price (GH₵) *</label>
        <input
          id="editHostelPrice"
          name="price"
          type="number"
          min="0"
          step="1"
          required
        >
      </div>

      <div class="form-group">
        <label for="editHostelRoomType">Room Type</label>
        <input
          id="editHostelRoomType"
          name="roomType"
          type="text"
          maxlength="100"
          placeholder="e.g. 4-in-a-room"
        >
      </div>

      <div class="form-group">
        <label for="editHostelAvailability">Availability Status</label>
        <select id="editHostelAvailability" name="availabilityStatus">
          <option value="not_verified">Not Verified</option>
          <option value="available">Available</option>
          <option value="limited">Limited Availability</option>
          <option value="full">Full</option>
        </select>
      </div>

      <div class="form-group">
        <label for="editHostelAvailabilityMessage">
          Availability Message
        </label>
        <input
          id="editHostelAvailabilityMessage"
          name="availabilityMessage"
          type="text"
          maxlength="250"
          placeholder="e.g. Only 2 rooms left"
        >
      </div>

      <div class="form-group">
        <label for="editHostelImages">Image Paths or URLs</label>
        <textarea
          id="editHostelImages"
          name="images"
          rows="4"
          placeholder="Enter one image path or URL per line"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="editHostelVideo">Video Path or URL</label>
        <input
          id="editHostelVideo"
          name="video"
          type="text"
          maxlength="1000"
          placeholder="Optional video path or URL"
        >
      </div>

      <div class="form-group">
        <label for="editHostelAmenities">Amenities</label>
        <textarea
          id="editHostelAmenities"
          name="amenities"
          rows="4"
          placeholder="Enter one amenity per line"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="editHostelRules">House Rules</label>
        <textarea
          id="editHostelRules"
          name="rules"
          rows="4"
          placeholder="Enter one rule per line"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="editHostelDescription">Description</label>
        <textarea
          id="editHostelDescription"
          name="description"
          rows="4"
          maxlength="3000"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="editHostelLandmarks">Nearby Landmarks</label>
        <textarea
          id="editHostelLandmarks"
          name="landmarks"
          rows="3"
          maxlength="1000"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="editHostelDistance">Distance Information</label>
        <input
          id="editHostelDistance"
          name="distance"
          type="text"
          maxlength="250"
        >
      </div>

      <div class="form-group">
        <label for="editHostelPublished">Publication Status</label>
        <select id="editHostelPublished" name="isPublished">
          <option value="1">Published</option>
          <option value="0">Unpublished</option>
        </select>
      </div>
    </div>

    <div class="form-group">
  <label for="editHostelVerified">HOSTFind Verification</label>
  <select id="editHostelVerified" required>
    <option value="0">Not Verified</option>
    <option value="1">HOSTFind Verified ✓</option>
  </select>
  <small>
    Verify this hostel only after you have checked its information.
  </small>
</div>

    <p id="hostelEditorMessage" role="status" aria-live="polite"></p>

    <div class="form-actions">
      <button type="submit" id="saveHostelButton" class="primary-button">
        Save Hostel Changes
      </button>

      <button type="button" id="cancelHostelEditButton">
        Cancel
      </button>
    </div>
  </form>
</section>


<!-- Manage private hostel manager information -->

<section class="manager-management" aria-labelledby="managerManagementTitle">
  <div class="section-heading">
    <h2 id="managerManagementTitle">Manage Hostel Manager Details</h2>
    <p>
      Select a hostel to add or update its manager contact and payment information.
    </p>
  </div>

  <form id="managerDetailsForm">
    <div class="form-group">
      <label for="managerHostelSelect">Select Hostel</label>
      <select id="managerHostelSelect" name="hostelId" required>
        <option value="">Loading hostels...</option>
      </select>
    </div>

    <h3>Manager Contact Information</h3>

    <div class="form-grid">
      <div class="form-group">
        <label for="managerName">Manager Name</label>
        <input id="managerName" name="managerName" type="text" maxlength="150">
      </div>

      <div class="form-group">
        <label for="managerPhone">Phone Number</label>
        <input id="managerPhone" name="managerPhone" type="tel" maxlength="30">
      </div>

      <div class="form-group">
        <label for="managerWhatsApp">WhatsApp Number</label>
        <input id="managerWhatsApp" name="managerWhatsApp" type="tel" maxlength="30">
      </div>

      <div class="form-group">
        <label for="managerEmail">Email Address</label>
        <input id="managerEmail" name="managerEmail" type="email" maxlength="254">
      </div>
    </div>

    <h3>Mobile Money Details</h3>

    <div class="form-grid">
      <div class="form-group">
        <label for="momoNetwork">Mobile Money Network</label>
        <input id="momoNetwork" name="momoNetwork" type="text" maxlength="50" placeholder="e.g. MTN">
      </div>

      <div class="form-group">
        <label for="momoName">Registered Account Name</label>
        <input id="momoName" name="momoName" type="text" maxlength="150">
      </div>

      <div class="form-group">
        <label for="momoNumber">Mobile Money Number</label>
        <input id="momoNumber" name="momoNumber" type="tel" maxlength="30">
      </div>
    </div>

    <h3>Bank Account Details</h3>

    <div class="form-grid">
      <div class="form-group">
        <label for="bankName">Bank Name</label>
        <input id="bankName" name="bankName" type="text" maxlength="100">
      </div>

      <div class="form-group">
        <label for="bankAccountName">Account Name</label>
        <input id="bankAccountName" name="bankAccountName" type="text" maxlength="150">
      </div>

      <div class="form-group">
        <label for="bankAccountNumber">Account Number</label>
        <input id="bankAccountNumber" name="bankAccountNumber" type="text" maxlength="50">
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" id="saveManagerDetailsButton">
        Save Manager Details
      </button>

      <span id="managerFormMessage" role="status" aria-live="polite"></span>
    </div>
  </form>
</section>





    <section class="panel">
      <div class="panel-header">
        <h2>Manager Information</h2>
        <p>
          The next module will allow you to add and update private details
          for each hostel.
        </p>
      </div>

      <div class="panel-body">
        <div class="notice">
          <strong>Important: Verify details before saving</strong>
          Collect the manager's permission and confirm contact numbers,
          Mobile Money information and bank details before entering them.
          Do not use sample or invented financial information.
        </div>

        <div class="actions">
          <article class="action-card">
            <h3>Hostel Manager Records</h3>
            <p>
              Select a hostel and enter the manager's name, telephone number,
              WhatsApp number and email address.
            </p>
          </article>

          <article class="action-card">
            <h3>Payment Information</h3>
            <p>
              Record verified Mobile Money and bank account details in the
              protected SQLite database, not in public website files.
            </p>
          </article>
        </div>
      </div>
    </section>

    <footer class="footer">
      HOSTFind Administration Portal<br>
      Protect administrator credentials and private manager information.
    </footer>
  </main>

  <script src="/js/admin-dashboard.js" defer></script>
</body>
</html>`);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`HOSTFind running at http://localhost:${PORT}`);
});





