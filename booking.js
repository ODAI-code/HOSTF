document.addEventListener("DOMContentLoaded", async () => {
  const root = document.querySelector("#hostel-detail");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const hostelId = params.get("hostel");

  // Require a hostel ID from the URL.
  if (!hostelId) {
    root.innerHTML = `
      <div class="empty-state">
        <h2>No hostel selected</h2>
        <p>Please return to the hostel listings and select a hostel.</p>
        <a class="btn btn-primary" href="hostels.html">Browse Hostels</a>
      </div>
    `;
    return;
  }

  try {
    // Load the published hostels from the database-backed API.
    const response = await fetch("/api/hostels");
    const result = await response.json();

       if (!response.ok || !Array.isArray(result)) {
      throw new Error("Unable to load hostel listings.");
    }

    // Match the selected hostel ID instead of using the first hostel.
    const hostel = result.find(
      item => String(item.id) === String(hostelId)
    );

    if (!hostel) {
      root.innerHTML = `
        <div class="empty-state">
          <h2>Hostel not found</h2>
          <p>This hostel may no longer be published. Please select another hostel.</p>
          <a class="btn btn-primary" href="hostels.html">Browse Hostels</a>
        </div>
      `;
      return;
    }

    const images = Array.isArray(hostel.images) ? hostel.images : [];
    const amenities = Array.isArray(hostel.amenities) ? hostel.amenities : [];
    const rules = Array.isArray(hostel.rules) ? hostel.rules : [];
    const mainImage = images[0] || "images/hostels/placeholder.svg";

    // Safely format values that may be missing.
    const escapeHTML = value =>
      String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);

    const formatPrice = value =>
      Number(value || 0).toLocaleString("en-GH");

    // Render the selected hostel's details.
    root.innerHTML = `
      <div class="two-column">
        <section class="panel">
          <span class="badge">HOSTEL DETAILS</span>
          <h2>${escapeHTML(hostel.name)}</h2>

          <p class="muted">
            📍 ${escapeHTML(hostel.location)}
            · ${escapeHTML(hostel.roomType)}
          </p>

          <img
            id="gallery-main"
            class="gallery-main"
            src="${escapeHTML(mainImage)}"
            alt="Room image for ${escapeHTML(hostel.name)}"
            onerror="this.onerror=null;this.src='images/hostels/placeholder.svg'"
          >

          <div class="gallery-thumbs" aria-label="Room photo gallery">
            ${images.slice(0, 3).map((img, i) => `
              <button
                type="button"
                class="${i === 0 ? "active" : ""}"
                data-gallery-image="${escapeHTML(img)}"
                aria-label="Show room image ${i + 1}"
              >
                <img
                  src="${escapeHTML(img)}"
                  alt="Room thumbnail ${i + 1}"
                  onerror="this.onerror=null;this.src='images/hostels/placeholder.svg'"
                >
              </button>
            `).join("")}
          </div>

          ${hostel.video ? `
            <video
              controls
              preload="metadata"
              width="100%"
              poster="${escapeHTML(mainImage)}"
            >
              <source src="${escapeHTML(hostel.video)}" type="video/mp4">
              Your browser does not support HTML5 video.
            </video>
          ` : ""}
        </section>

        <section class="panel">
          <h2>Hostel information</h2>
          <p>${escapeHTML(hostel.description)}</p>

          <dl class="details">
            <dt>Location</dt>
            <dd>${escapeHTML(hostel.location)}</dd>

            <dt>Annual rent</dt>
            <dd>GH₵ ${formatPrice(hostel.price)}</dd>

            <dt>Room type</dt>
            <dd>${escapeHTML(hostel.roomType)}</dd>

            <dt>Availability</dt>
            <dd>${escapeHTML(hostel.availability)}</dd>

            <dt>Nearby landmarks</dt>
            <dd>${escapeHTML(hostel.landmarks)}</dd>

            <dt>Distance from UCC</dt>
            <dd>${escapeHTML(hostel.distance)}</dd>
          </dl>

          <h3>Amenities</h3>
          <div class="amenities">
            ${amenities.length
              ? amenities.map(item =>
                  `<span class="amenity">${escapeHTML(item)}</span>`
                ).join("")
              : "<p>Contact HOSTFind for amenity information.</p>"
            }
          </div>

          <h3>Hostel rules</h3>
          <ul class="list-clean">
            ${rules.length
              ? rules.map(rule => `<li>${escapeHTML(rule)}</li>`).join("")
              : "<li>Contact the hostel manager for the rules.</li>"
            }
          </ul>

          <div class="notice">
            <strong>Important:</strong>
            GH₵47.00 is a HOSTFind contact-details unlock fee, not hostel rent.
            Verify the listing and payment details independently before paying rent.
          </div>

          <p>
            <a class="btn btn-primary" href="#payment-form">
              Book &amp; Pay — GH₵47.00 unlock fee
            </a>
          </p>
        </section>
      </div>

      <section class="payment-card" id="payment-form" style="margin-top:1.2rem">
        <h2>Unlock manager details</h2>

        <p>
          Selected hostel:
          <strong>${escapeHTML(hostel.name)}</strong>
          · ${escapeHTML(hostel.location)}
        </p>

        <p>
          Hostel rent:
          <strong>GH₵ ${formatPrice(hostel.price)}</strong>
        </p>

        <p class="price">Unlock fee: GH₵47.00</p>

        <form id="unlock-form" class="form-grid">
          <div class="field">
            <label for="student-name">Student name</label>
            <input
              id="student-name"
              name="name"
              required
              autocomplete="name"
            >
          </div>

          <div class="field">
            <label for="student-email">Student email</label>
            <input
              id="student-email"
              name="email"
              type="email"
              required
              autocomplete="email"
            >
          </div>

          <div class="field">
            <label for="student-phone">Student phone number</label>
            <input
              id="student-phone"
              name="phone"
              type="tel"
              required
              autocomplete="tel"
            >
          </div>

          <div class="field full">
            <button class="btn btn-primary" type="submit">
              Pay GH₵47.00 &amp; Unlock Details
            </button>
          </div>
        </form>

        <div id="payment-status" role="status" aria-live="polite"></div>

        <p class="small-note">
          Payment will be initialized and verified through the backend.
          Confirm the listing details and payment instructions before paying hostel rent.
        </p>

        <div id="manager-details" class="hidden"></div>
      </section>
    `;

    // Enable switching between hostel gallery images.
    root.querySelectorAll("[data-gallery-image]").forEach(button => {
      button.addEventListener("click", () => {
        root.querySelector("#gallery-main").src =
          button.dataset.galleryImage;

        root.querySelectorAll("[data-gallery-image]").forEach(item => {
          item.classList.toggle("active", item === button);
        });
      });
    });

    // Initialize the payment form.
    const form = root.querySelector("#unlock-form");
    const status = root.querySelector("#payment-status");

    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const fields = Object.fromEntries(
        new FormData(form).entries()
      );

      status.className = "status";
      status.textContent = "Preparing secure Paystack checkout...";

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;

      try {
        const paymentResponse = await fetch("/api/payments/initialize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...fields,
            hostelId: hostel.id,
            hostelName: hostel.name,
            location: hostel.location
          })
        });

        const data = await paymentResponse.json();

        if (!paymentResponse.ok || !data.authorizationUrl) {
          throw new Error(
            data.error || "Could not initialize payment."
          );
        }

        sessionStorage.setItem(
          "hostfind_pending_hostel_id",
          String(hostel.id)
        );

        // The backend handles the Paystack secret key.
        window.location.href = data.authorizationUrl;

      } catch (error) {
        status.className = "status error";
        status.textContent =
          `${error.message} Ensure the server is running and .env contains matching Paystack test keys.`;

        button.disabled = false;
      }
    });

  } catch (error) {
    console.error("HOSTFind booking page error:", error);

    root.innerHTML = `
      <div class="empty-state">
        <h2>Unable to load hostel details</h2>
        <p>Please refresh the page and try again.</p>
        <a class="btn btn-primary" href="hostels.html">Browse Hostels</a>
      </div>
    `;
  }
});