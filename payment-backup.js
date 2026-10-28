document.addEventListener("DOMContentLoaded", async () => {
  const root = document.querySelector("#payment-result");
  if (!root) return;
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");
  if (!reference) {
    root.innerHTML = `<div class="status error"><strong>No transaction reference found.</strong><p>If you completed payment, contact support with your receipt before trying again.</p></div>`;
    return;
  }
  root.innerHTML = `<div class="status">Verifying your payment securely with the server. Please wait...</div>`;
  try {
    const response = await fetch(`/api/payments/verify/${encodeURIComponent(reference)}`);
    const result = await response.json();
    if (!response.ok || !result.verified) throw new Error(result.error || "Payment could not be verified.");
    const hostelId = sessionStorage.getItem("hostfind_pending_hostel_id");
    const hostel = (typeof hostels !== "undefined" ? hostels.find(h => String(h.id) === String(hostelId)) : null);
    root.innerHTML = `
      <div class="status success"><h2>Payment Successful!</h2><p>Your GHS 35.00 unlock fee was verified by the server.</p></div>
      <div class="panel">
        <h2>Hostel manager contact details</h2>
        <p class="notice">Confirm the manager identity, room availability and rent directly before paying hostel rent. <!-- For launch: return manager/payment details from a protected server endpoint only after the verified transaction is matched to this hostel and student. Do not store real manager/payment details in public JavaScript. --></p>
        ${hostel ? `
          <p><strong>Hostel:</strong> ${escapeHTML(hostel.name)} · ${escapeHTML(hostel.location)}</p>
          <p><strong>Manager:</strong> ${escapeHTML(hostel.manager.name)}</p>
          <p><strong>Phone:</strong> ${escapeHTML(hostel.manager.phone)}</p>
          <p><strong>WhatsApp:</strong> ${escapeHTML(hostel.manager.whatsapp)}</p>
          <p><strong>Email:</strong> ${escapeHTML(hostel.manager.email)}</p>
          <p><strong>Mobile Money:</strong> ${escapeHTML(hostel.paymentDetails.momoNetwork)}</p>
          <p><strong>Account name:</strong> ${escapeHTML(hostel.paymentDetails.momoName)}</p>
          <p><strong>MoMo number:</strong> ${escapeHTML(hostel.paymentDetails.momoNumber)}</p>
          <p><strong>Bank:</strong> ${escapeHTML(hostel.paymentDetails.bank)}</p>
          <p><strong>Bank account name:</strong> ${escapeHTML(hostel.paymentDetails.accountName)}</p>
          <p><strong>Bank account number:</strong> ${escapeHTML(hostel.paymentDetails.accountNumber)}</p>
          <div class="inline-actions">
            <a class="btn btn-primary" href="tel:${encodeURIComponent(hostel.manager.phone)}">Call Manager</a>
            <a class="btn btn-secondary" target="_blank" rel="noopener" href="https://wa.me/${encodeURIComponent(hostel.manager.whatsapp)}">WhatsApp Manager</a>
            <button class="btn btn-secondary" id="copy-manager-number" type="button">Copy Number</button>
            <a class="btn btn-secondary" href="booking.html?hostel=${encodeURIComponent(hostel.id)}">Back to Hostel</a>
          </div>
          <div id="copy-status" class="small-note" role="status"></div>
        ` : `<p>Payment verified, but the selected hostel could not be identified because this browser session is missing. Return to the hostel page or contact support for assistance.</p>`}
      </div>`;
    const copyButton = root.querySelector("#copy-manager-number");
    if (copyButton && hostel) {
      copyButton.addEventListener("click", async () => {
        const message = root.querySelector("#copy-status");
        try {
          await navigator.clipboard.writeText(hostel.manager.phone);
          message.textContent = "Phone number copied.";
        } catch {
          message.textContent = `Manager phone: ${hostel.manager.phone}`;
        }
      });
    }
  } catch (error) {
    root.innerHTML = `<div class="status error"><h2>Payment not verified</h2><p>${escapeHTML(error.message)}</p><p>Do not pay again until you have checked your Paystack receipt or contacted support.</p><a class="btn btn-secondary" href="hostels.html">Back to hostels</a></div>`;
  }
});
