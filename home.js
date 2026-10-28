document.addEventListener("DOMContentLoaded", () => {
  const locationRoot = document.querySelector("#home-locations");
  if (locationRoot && typeof hostels !== "undefined") {
    const descriptions = {
      "Amamoma":"A student accommodation area often considered by UCC students.",
      "Kwaprow":"Explore hostel listings in the Kwaprow area.",
      "Apewosika":"Browse student-room options in Apewosika.",
      "Abura":"Explore accommodation options in Abura.",
      "Ola":"Browse hostel listings around Ola.",
      "Ayensu":"Hostel listings for the Ayensu area."
    };
    locationRoot.innerHTML = [...new Set(hostels.map(h=>h.location))].map(loc => {
      const count = hostels.filter(h=>h.location===loc).length;
      return `<article class="location-card"><div class="location-icon" aria-hidden="true">⌖</div><h3>${loc}</h3><p>${descriptions[loc] || "Explore accommodation options."}</p><p class="muted">${count} hostels</p><a class="btn btn-secondary" href="hostels.html?q=${encodeURIComponent(loc)}">View Hostels</a></article>`;
    }).join("");
  }
  
    const featured = document.querySelector("[data-featured-hostels]");

  if (featured) {
    fetch("/api/hostels")
      .then(response => {
        if (!response.ok) {
          throw new Error("Unable to load featured hostels.");
        }
        return response.json();
      })
      .then(list => {
        if (!Array.isArray(list)) {
          throw new Error("Invalid hostel listing response.");
        }

        renderHostelList(featured, list.slice(0, 3));
      })
      .catch(error => {
        console.error("HOSTFind featured hostels error:", error);
        featured.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <h3>Unable to load featured hostels</h3>
            <p>Please refresh the page and try again.</p>
          </div>
        `;
      });
  }
});
