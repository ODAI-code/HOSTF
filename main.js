const SUPPORT_WHATSAPP = ""; // Add your WhatsApp number with country code, digits only (example format: 233XXXXXXXXX).
const SUPPORT_MESSAGE = "Hello HOSTFind, I need help finding a hostel.";

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav-links");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

  document.querySelectorAll("[data-whatsapp]").forEach(link => {
    if (SUPPORT_WHATSAPP) {
      link.href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      // Add your WhatsApp number to SUPPORT_WHATSAPP above before publishing.
      link.href = "contact.html";
    }
  });

  document.querySelectorAll("[data-hostel-search]").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const input = form.querySelector("input");
      const query = input ? input.value.trim() : "";
      window.location.href = `hostels.html?q=${encodeURIComponent(query)}`;
    });
  });

  const contactForm = document.querySelector("#contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", event => {
      event.preventDefault();
      const status = contactForm.querySelector("[data-form-status]");
      if (!contactForm.reportValidity()) return;
      status.textContent = "Thank you. Your message has been prepared. Connect this form to a backend or form service to deliver it.";
      status.className = "status success";
      contactForm.reset();
    });
  }

  const listingForm = document.querySelector("#listing-form");
  if (listingForm) {
    listingForm.addEventListener("submit", event => {
      event.preventDefault();
      if (!listingForm.reportValidity()) return;
      const status = listingForm.querySelector("[data-form-status]");
      status.textContent = "Your listing details have been captured in this page. Connect a backend/database to submit and review listings.";
      status.className = "status success";
      listingForm.reset();
    });
  }
});
