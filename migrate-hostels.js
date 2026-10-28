const db = require("./database");
const { hostels } = require("./js/hostel-data");

// Prepare a statement for saving private hostel details.
const savePrivateDetails = db.prepare(`
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

const migrate = db.transaction(() => {
  for (const hostel of hostels) {
    const manager = hostel.manager || {};
    const payment = hostel.paymentDetails || {};

    savePrivateDetails.run(
      String(hostel.id),
      manager.name || "",
      manager.phone || "",
      manager.whatsapp || "",
      manager.email || "",
      payment.momoNetwork || "",
      payment.momoName || "",
      payment.momoNumber || "",
      payment.bank || "",
      payment.accountName || "",
      payment.accountNumber || ""
    );
  }
});

try {
  migrate();

  const result = db.prepare(`
    SELECT COUNT(*) AS total
    FROM hostel_private_details
  `).get();

  console.log(
    `Migration successful. ${result.total} hostel records are stored in SQLite.`
  );
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}