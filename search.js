function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}

function getHostelById(id) {
  return hostels.find(hostel => String(hostel.id) === String(id));
}



function hostelCard(hostel) {
  const img = hostel.images?.[0] || "images/hostels/placeholder.svg";

  return `
    <article class="hostel-card">

      <div class="hostel-image-container">
        <img
          class="hostel-image"
          src="${escapeHTML(img)}"
          alt="Hostel room image for ${escapeHTML(hostel.name)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='images/hostels/placeholder.svg'"
        >

${(hostel.isVerified === true || hostel.isVerified === 1 || hostel.isVerified === "1" || hostel.is_verified === true || hostel.is_verified === 1 || hostel.is_verified === "1") ? `          <span class="verified-badge hostel-image-verified">
            ✓ VERIFIED
          </span>
        ` : ""}
      </div>

      <div class="hostel-body">

        <h3>${escapeHTML(hostel.name)}</h3>

        <p class="muted">
  📍 ${escapeHTML(hostel.location)} · ${escapeHTML(hostel.roomType)}
</p>

${hostel.description ? `
  <p class="hostel-description">
    ${escapeHTML(hostel.description)}
  </p>
` : ""}

<p class="price">
        <p class="price">
          GH₵ ${Number(hostel.price).toLocaleString("en-GH")}
          <small>/ academic year</small>
        </p>

        <div class="hostel-availability">
          <span class="badge ${
            hostel.availabilityStatus === "available" ? "badge-available" :
            hostel.availabilityStatus === "limited" ? "badge-limited" :
            hostel.availabilityStatus === "full" ? "badge-full" :
            "badge-unverified"
          }">
            ${
              hostel.availabilityStatus === "available" ? "AVAILABLE" :
              hostel.availabilityStatus === "limited" ? "LIMITED" :
              hostel.availabilityStatus === "full" ? "FULL" :
              "UNCONFIRMED"
            }
          </span>

          ${hostel.availability ? `
            <span class="availability-message-badge">
              ${escapeHTML(hostel.availability)}
            </span>
          ` : ""}
        </div>

        <div class="amenities">
          ${(hostel.amenities || [])
            .map(item => `<span class="amenity">${escapeHTML(item)}</span>`)
            .join("")}
        </div>

        <div class="card-actions">
          <a
            class="btn btn-secondary"
            href="booking.html?hostel=${encodeURIComponent(hostel.id)}&mode=view"
          >View Room</a>

          <a
            class="btn btn-primary"
            href="booking.html?hostel=${encodeURIComponent(hostel.id)}"
          >Book &amp; Pay</a>
        </div>

      </div>
    </article>`;
}



function renderHostelList(target, list) {
  if (!target) return;
  target.innerHTML = list.length
    ? list.map(hostelCard).join("")
    : `<div class="empty-state" style="grid-column:1/-1"><h3>No hostels found</h3><p>Try another name, location, amenity or filter.</p></div>`;
}

document.addEventListener("DOMContentLoaded", () => {


// Load published hostel listings from the SQLite-backed API.
let hostels = [];

async function loadPublicHostels() {
  try {
    const response = await fetch("/api/hostels");
    const result = await response.json();

    if (!response.ok || !Array.isArray(result)) {
      throw new Error("Unable to load hostel listings.");
    }

    hostels = result;
    initializeHostelSearch();
  } catch (error) {
    console.error("HOSTFind public hostel loading error:", error);

    const grid = document.querySelector("[data-hostel-grid]");

    if (grid) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <h3>Unable to load hostels</h3>
          <p>Please refresh the page or try again later.</p>
        </div>
      `;
    }
  }
}



    loadPublicHostels();


  function initializeHostelSearch() {
    const grid = document.querySelector("[data-hostel-grid]");
  if (!grid) return;

  const search = document.querySelector("#hostel-search");
  const suggestions = document.querySelector("#hostel-search-suggestions");
  const location = document.querySelector("#filter-location");
  const minPrice = document.querySelector("#min-price");
  const maxPrice = document.querySelector("#max-price");
  const roomType = document.querySelector("#filter-room");
  const availability = document.querySelector("#filter-availability");
  const amenityBoxes = [...document.querySelectorAll("[name='amenity-filter']")];
  const sort = document.querySelector("#sort-hostels");

  function updateSearchSuggestions() {
  if (!search || !suggestions) return;

  const query = search.value.trim().toLowerCase();

  if (query.length < 2) {
    suggestions.innerHTML = "";
    suggestions.hidden = true;
    return;
  }

  const matches = hostels
    .filter(hostel => {
      const searchableFields = [
        hostel.name,
        hostel.location,
        hostel.roomType,
        hostel.description,
        ...(hostel.amenities || [])
      ];

      return searchableFields.some(value =>
        String(value || "").toLowerCase().includes(query)
      );
    })
    .slice(0, 6);

  if (!matches.length) {
    suggestions.innerHTML = `
      <div class="search-suggestion-empty">
        No matching hostels found
      </div>
    `;
    suggestions.hidden = false;
    return;
  }

  suggestions.innerHTML = matches.map(hostel => `
    <button
      type="button"
      class="search-suggestion"
      role="option"
      data-hostel-suggestion="${escapeHTML(hostel.id)}"
    >
      <span class="search-suggestion-name">
        ${escapeHTML(hostel.name)}
      </span>
      <span class="search-suggestion-details">
        ${escapeHTML(hostel.location)} · ${escapeHTML(hostel.roomType)}
      </span>
    </button>
  `).join("");

  suggestions.hidden = false;
}
  const params = new URLSearchParams(locationSearch());
  if (search) search.value = params.get("q") || "";

  if (location) {
    [...new Set(hostels.map(h => h.location))].sort().forEach(loc => {
      const option = document.createElement("option");
      option.value = loc;
      option.textContent = loc;
      location.appendChild(option);
    });
  }


  function apply() {
    const q = (search?.value || "").trim().toLowerCase();
    const min = minPrice?.value === "" ? 0 : Number(minPrice.value);
    const max = maxPrice?.value === "" ? Infinity : Number(maxPrice.value);
    const selectedAmenities = amenityBoxes.filter(box => box.checked).map(box => box.value.toLowerCase());

    let list = hostels.filter(h => {
      const haystack = [h.name, h.location, h.roomType, h.description, ...h.amenities].join(" ").toLowerCase();
      return (!q || haystack.includes(q)) &&
        (!location?.value || h.location === location.value) &&
        h.price >= min && h.price <= max &&
        (!roomType?.value || h.roomType === roomType.value) &&
        (!availability?.value || h.availabilityStatus === availability.value) &&        selectedAmenities.every(a => h.amenities.some(item => item.toLowerCase() === a));
    });

    switch (sort?.value) {
      case "price-low": list.sort((a,b) => a.price-b.price); break;
      case "price-high": list.sort((a,b) => b.price-a.price); break;
      case "name": list.sort((a,b) => a.name.localeCompare(b.name)); break;
      case "location": list.sort((a,b) => a.location.localeCompare(b.location)); break;
    }
    renderHostelList(grid, list);
    const count = document.querySelector("[data-results-count]");
    if (count) count.textContent = `${list.length} hostel${list.length === 1 ? "" : "s"} found`;
  }

 [search, location, minPrice, maxPrice, roomType, availability, sort, ...amenityBoxes]
  .filter(Boolean)
  .forEach(el => el.addEventListener("input", apply));

search?.addEventListener("input", updateSearchSuggestions);


suggestions?.addEventListener("click", event => {
  const button = event.target.closest("[data-hostel-suggestion]");

  if (!button) return;

  const hostel = hostels.find(
    item => String(item.id) === button.dataset.hostelSuggestion
  );

  if (!hostel || !search) return;

  search.value = hostel.name;
  suggestions.innerHTML = "";
  suggestions.hidden = true;

  apply();
});


  document.querySelector("#reset-filters")?.addEventListener("click", () => {
    if (search) search.value = "";
    if (location) location.value = "";
    if (minPrice) minPrice.value = "";
    if (maxPrice) maxPrice.value = "";
    if (roomType) roomType.value = "";
    if (availability) availability.value = "";
    if (sort) sort.value = "";
    amenityBoxes.forEach(box => box.checked = false);
    apply();
  });
     apply();
  }
});
 
function locationSearch() {
  return window.location.search || "";
}
