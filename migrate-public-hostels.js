const db = require("./database");
const { hostels } = require("./public/js/hostel-data");

if (!Array.isArray(hostels) || hostels.length === 0) {
  throw new Error("No hostel records were found in hostel-data.js.");
}

const insertHostel = db.prepare(`
  INSERT OR IGNORE INTO hostels (
    id,
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
    is_published
  )
  VALUES (
    @id,
    @name,
    @location,
    @price,
    @room_type,
    @description,
    @images_json,
    @video,
    @amenities_json,
    @availability_status,
    @availability_message,
    @rules_json,
    @landmarks,
    @distance,
    @is_published
  )
`);

const migrateHostels = db.transaction((records) => {
  let inserted = 0;
  let skipped = 0;

  for (const hostel of records) {
    if (
      !Number.isSafeInteger(Number(hostel.id)) ||
      Number(hostel.id) < 1 ||
      !String(hostel.name || "").trim() ||
      !String(hostel.location || "").trim() ||
      !Number.isFinite(Number(hostel.price)) ||
      Number(hostel.price) < 0
    ) {
      throw new Error(
        `Invalid hostel record encountered. ID: ${hostel.id}`
      );
    }

    const result = insertHostel.run({
      id: Number(hostel.id),
      name: String(hostel.name).trim(),
      location: String(hostel.location).trim(),
      price: Number(hostel.price),
      room_type: String(hostel.roomType || ""),
      description: String(hostel.description || ""),
      images_json: JSON.stringify(
        Array.isArray(hostel.images) ? hostel.images : []
      ),
      video: String(hostel.video || ""),
      amenities_json: JSON.stringify(
        Array.isArray(hostel.amenities) ? hostel.amenities : []
      ),

      // Existing availability has not yet been independently verified.
      availability_status: "not_verified",
      availability_message: String(hostel.availability || ""),

      rules_json: JSON.stringify(
        Array.isArray(hostel.rules) ? hostel.rules : []
      ),
      landmarks: String(hostel.landmarks || ""),
      distance: String(hostel.distance || ""),
      is_published: 1
    });

    if (result.changes === 1) {
      inserted++;
    } else {
      skipped++;
    }
  }

  return { inserted, skipped };
});

try {
  const result = migrateHostels(hostels);

  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM hostels
  `).get().total;

  console.log("HOSTFind hostel migration completed.");
  console.log(`Source hostel records: ${hostels.length}`);
  console.log(`New records inserted: ${result.inserted}`);
  console.log(`Existing records skipped: ${result.skipped}`);
  console.log(`Total records now in SQLite: ${total}`);

  if (total !== hostels.length) {
    console.warn(
      "The database record count differs from the source count. " +
      "Check the existing database records before continuing."
    );
  }
} catch (error) {
  console.error("HOSTFind hostel migration failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}