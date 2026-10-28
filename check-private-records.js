const db = require("./database");

try {
  const result = db.prepare(`
    SELECT
      COUNT(*) AS total,

      SUM(CASE WHEN TRIM(manager_name) != ''
          THEN 1 ELSE 0 END) AS manager_names,

      SUM(CASE WHEN TRIM(manager_phone) != ''
          THEN 1 ELSE 0 END) AS manager_phones,

      SUM(CASE WHEN TRIM(manager_whatsapp) != ''
          THEN 1 ELSE 0 END) AS whatsapp_numbers,

      SUM(CASE WHEN TRIM(manager_email) != ''
          THEN 1 ELSE 0 END) AS manager_emails,

      SUM(CASE WHEN TRIM(momo_number) != ''
          THEN 1 ELSE 0 END) AS momo_numbers,

      SUM(CASE WHEN TRIM(bank_account_number) != ''
          THEN 1 ELSE 0 END) AS bank_accounts

    FROM hostel_private_details
  `).get();

  console.log("Total private records:", result.total);
  console.log("Manager names:", result.manager_names || 0);
  console.log("Manager phone numbers:", result.manager_phones || 0);
  console.log("WhatsApp numbers:", result.whatsapp_numbers || 0);
  console.log("Manager emails:", result.manager_emails || 0);
  console.log("Mobile Money numbers:", result.momo_numbers || 0);
  console.log("Bank account numbers:", result.bank_accounts || 0);

} catch (error) {
  console.error("Inspection failed:", error.message);
} finally {
  db.close();
}