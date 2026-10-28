document.addEventListener("DOMContentLoaded", async () => {
  const root = document.querySelector("#payment-result");

  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const reference =
    params.get("reference") || params.get("trxref");

  if (!reference) {
    root.innerHTML = `
      <div class="status error">
        <h2>No transaction reference found</h2>
        <p>If you completed payment, check your Paystack receipt before trying again.</p>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="status">
      Verifying your payment securely. Please wait...
    </div>
  `;

  try {
    // Step 1: Ask the server to verify the Paystack transaction.
    const verifyResponse = await fetch(
      `/api/payments/verify/${encodeURIComponent(reference)}`
    );

    const verification = await verifyResponse.json();

    if (!verifyResponse.ok || !verification.verified) {
      throw new Error(
        verification.error || "Payment could not be verified."
      );
    }

    // Step 2: Get the hostel ID associated with the verified transaction.
    const hostelId = String(verification.hostelId || "");

    if (!/^\d+$/.test(hostelId)) {
      throw new Error(
        "The payment was verified, but the hostel ID is missing."
      );
    }

    // Step 3: Request private details using the verified reference.
    const detailsResponse = await fetch(
      `/api/hostels/${encodeURIComponent(hostelId)}/manager?reference=${encodeURIComponent(reference)}`
    );

    const detailsResult = await detailsResponse.json();

    if (!detailsResponse.ok || !detailsResult.success) {
      throw new Error(
        detailsResult.error ||
        "Could not retrieve the hostel manager's details."
      );
    }

    const details = detailsResult.details;

    // Escape values before inserting them into HTML.
    const safe = (value) => {
      const element = document.createElement("span");
      element.textContent = String(value || "");
      return element.innerHTML;
    };

    const managerName = details.managerName || "Not provided";
    const managerPhone = details.managerPhone || "";
    const managerWhatsApp = details.managerWhatsApp || "";
    const managerEmail = details.managerEmail || "";

    const hasManagerDetails = Boolean(
      managerPhone || managerWhatsApp || managerEmail
    );

    root.innerHTML = `
      <div class="status success">
        <h2>Payment Successful!</h2>
        <p>Your GH₵47.00 hostel contact-unlock payment has been verified.</p>
      </div>

      <div class="panel">
        <h2>Hostel Manager Details</h2>

        <p class="notice">
          Confirm the manager's identity, room availability and rent
          before paying hostel rent.
        </p>

        <p><strong>Hostel ID:</strong> ${safe(hostelId)}</p>
        <p><strong>Manager:</strong> ${safe(managerName)}</p>
        <p><strong>Phone:</strong> ${safe(managerPhone || "Not provided")}</p>
        <p><strong>WhatsApp:</strong> ${safe(managerWhatsApp || "Not provided")}</p>
        <p><strong>Email:</strong> ${safe(managerEmail || "Not provided")}</p>

        <h3>Payment Details</h3>

        <p><strong>Mobile Money Network:</strong> ${safe(details.momoNetwork || "Not provided")}</p>
        <p><strong>Account Name:</strong> ${safe(details.momoName || "Not provided")}</p>
        <p><strong>Mobile Money Number:</strong> ${safe(details.momoNumber || "Not provided")}</p>
        <p><strong>Bank:</strong> ${safe(details.bankName || "Not provided")}</p>
        <p><strong>Bank Account Name:</strong> ${safe(details.bankAccountName || "Not provided")}</p>
        <p><strong>Bank Account Number:</strong> ${safe(details.bankAccountNumber || "Not provided")}</p>

        <div class="inline-actions">
          ${
            managerPhone
              ? `<a class="btn btn-primary" href="tel:${encodeURIComponent(managerPhone)}">Call Manager</a>`
              : ""
          }

          ${
            managerWhatsApp
              ? `<a class="btn btn-secondary" target="_blank" rel="noopener" href="https://wa.me/${encodeURIComponent(managerWhatsApp.replace(/\D/g, ""))}">WhatsApp Manager</a>`
              : ""
          }

          <a class="btn btn-secondary" href="hostels.html">
            Back to Hostels
          </a>
        </div>

        ${
          !hasManagerDetails
            ? `<p class="small-note">The payment was verified, but manager contact information has not yet been added for this hostel. Please contact HOSTFind support.</p>`
            : ""
        }
      </div>
    `;
  } catch (error) {
    root.innerHTML = `
      <div class="status error">
        <h2>Unable to Complete Verification</h2>
        <p>${String(error.message || "An unexpected error occurred.")}</p>
        <p>
          Do not pay again immediately. Check your Paystack receipt
          or contact support if you were charged.
        </p>
        <a class="btn btn-secondary" href="hostels.html">
          Back to Hostels
        </a>
      </div>
    `;
  }
});