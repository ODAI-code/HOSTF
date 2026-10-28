document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("#all-locations");
  if (!root) return;
  const descriptions = {
    "Amamoma":"Student accommodation options in Amamoma. Confirm the exact address and route.",
    "Kwaprow":"Explore hostels in the Kwaprow area.",
    "Apewosika":"Compare hostel options in Apewosika.",
    "Abura":"Hostel listings for students considering Abura.",
    "Ola":"Browse hostel listings in Ola.",
    "Ayensu":"Explore hostels around Ayensu."
  };
  root.innerHTML = [...new Set(hostels.map(h=>h.location))].map(loc => {
    const count = hostels.filter(h=>h.location===loc).length;
    return `<article class="location-card"><div class="location-icon" aria-hidden="true">⌖</div><h2>${loc}</h2><p>${descriptions[loc]}</p><p><strong>${count} hostels</strong></p><p class="muted">Nearby UCC landmarks: confirm exact landmarks with the property manager.</p><a class="btn btn-primary" href="hostels.html?q=${encodeURIComponent(loc)}">View Hostels</a></article>`;
  }).join("");
});
