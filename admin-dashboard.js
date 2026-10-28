document.addEventListener("DOMContentLoaded", () => {
  const logoutButton = document.getElementById("logoutButton");

  // Manager form elements.
  const managerForm = document.getElementById("managerDetailsForm");
  const hostelSelect = document.getElementById("managerHostelSelect");

// Hostel management table elements.
const hostelSearch = document.getElementById("hostelSearch");
const hostelManagementTableBody = document.getElementById(
  "hostelManagementTableBody"
);
const hostelManagementMessage = document.getElementById(
  "hostelManagementMessage"
);
const addHostelButton = document.getElementById("addHostelButton");


// Hostel editor form elements.
const hostelEditorSection = document.getElementById("hostelEditorSection");
const hostelEditorForm = document.getElementById("hostelEditorForm");
const hostelEditorTitle = document.getElementById("hostelEditorTitle");
const hostelEditorMessage = document.getElementById("hostelEditorMessage");
const cancelHostelEditButton = document.getElementById(
  "cancelHostelEditButton"
);

const saveHostelButton = document.getElementById("saveHostelButton");



  const saveButton = document.getElementById("saveManagerDetailsButton");
  const formMessage = document.getElementById("managerFormMessage");

  // All manager fields that are stored in SQLite.
  const managerFields = [
    "managerName",
    "managerPhone",
    "managerWhatsApp",
    "managerEmail",
    "momoNetwork",
    "momoName",
    "momoNumber",
    "bankName",
    "bankAccountName",
    "bankAccountNumber"
  ];





  // Safely request JSON from the server.
  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/admin/login");
      throw new Error("Administrator session expired.");
    }

    if (!response.ok || result.success === false) {
      throw new Error(result.error || "The request could not be completed.");
    }

    return result;
  }

  // Display a message beside the form.
  function showFormMessage(message, isError = false) {
    if (!formMessage) return;

    formMessage.textContent = message;
    formMessage.style.color = isError ? "#b42318" : "#16794b";
  }

  // Clear the manager form.
  function clearManagerForm() {
    managerFields.forEach((fieldName) => {
      const input = document.getElementById(fieldName);

      if (input) {
        input.value = "";
      }
    });
  }



  // Load real statistics from the protected admin API.
  async function loadDashboardStats() {
    const hostelCountElement = document.getElementById("hostelCount");
    const privateRecordCountElement =
      document.getElementById("privateRecordCount");
    const completedManagerCountElement =
      document.getElementById("completedManagerCount");

    try {
      const result = await apiRequest("/api/admin/stats");
      const stats = result.stats;

      if (hostelCountElement) {
        hostelCountElement.textContent = stats.hostelCount;
      }

      if (privateRecordCountElement) {
        privateRecordCountElement.textContent = stats.privateRecordCount;
      }

      if (completedManagerCountElement) {
        completedManagerCountElement.textContent =
          stats.completedManagerCount;
      }
    } catch (error) {
      console.error("HOSTFind dashboard statistics error:", error);

      [
        hostelCountElement,
        privateRecordCountElement,
        completedManagerCountElement
      ].forEach((element) => {
        if (element) element.textContent = "—";
      });
    }
  }

// Store the latest hostel records for searching and rendering.
let allAdminHostels = [];

// Display hostel records in the management table.
function renderHostelManagementTable(hostelsToRender) {
  if (!hostelManagementTableBody) return;

  if (hostelsToRender.length === 0) {
    hostelManagementTableBody.innerHTML = `
      <tr>
        <td colspan="8">No hostels match your search.</td>
      </tr>
    `;
    return;
  }

  hostelManagementTableBody.replaceChildren();

  hostelsToRender.forEach((hostel) => {
    const row = document.createElement("tr");

    const values = [
      hostel.id,
      hostel.name,
      hostel.location,
      `GH₵ ${Number(hostel.price).toLocaleString()}`,
      hostel.roomType || "Not specified",
      hostel.availabilityStatus || "not_verified",
      hostel.isPublished ? "Yes" : "No"
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.appendChild(cell);
    });

    const actionCell = document.createElement("td");
    const editButton = document.createElement("button");

    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.className = "primary-button";
    editButton.dataset.hostelId = String(hostel.id);

    editButton.addEventListener("click", () => {
  if (!hostelEditorSection || !hostelEditorForm) {
    console.error("HOSTFind hostel editor form was not found.");
    return;
  }

  // Set the form heading and hostel ID.
  if (hostelEditorTitle) {
    hostelEditorTitle.textContent = `Edit ${hostel.name}`;
  }

  document.getElementById("editHostelId").value = hostel.id;
  document.getElementById("editHostelName").value = hostel.name || "";
  document.getElementById("editHostelLocation").value =
    hostel.location || "";
  document.getElementById("editHostelPrice").value = hostel.price ?? 0;
  document.getElementById("editHostelRoomType").value =
    hostel.roomType || "";

  document.getElementById("editHostelAvailability").value =
    hostel.availabilityStatus || "not_verified";

  document.getElementById("editHostelAvailabilityMessage").value =
    hostel.availabilityMessage || "";

  document.getElementById("editHostelImages").value =
    Array.isArray(hostel.images) ? hostel.images.join("\n") : "";

  document.getElementById("editHostelVideo").value =
    hostel.video || "";

  document.getElementById("editHostelAmenities").value =
    Array.isArray(hostel.amenities) ? hostel.amenities.join("\n") : "";

  document.getElementById("editHostelRules").value =
    Array.isArray(hostel.rules) ? hostel.rules.join("\n") : "";

  document.getElementById("editHostelDescription").value =
    hostel.description || "";

  document.getElementById("editHostelLandmarks").value =
    hostel.landmarks || "";

  document.getElementById("editHostelDistance").value =
    hostel.distance || "";

  document.getElementById("editHostelPublished").value =
    hostel.isPublished ? "1" : "0";

    document.getElementById("editHostelVerified").value =
  hostel.isVerified ? "1" : "0";

  if (hostelEditorMessage) {
    hostelEditorMessage.textContent =
      "Editing mode: changes have not been saved.";
  }

  if (saveHostelButton) {
    saveHostelButton.disabled = false;
saveHostelButton.textContent =
  hostelEditorTitle?.textContent === "Add New Hostel"
    ? "Add Hostel"
    : "Save Hostel Changes";
    }

  // Reveal the form and bring it into view.
  hostelEditorSection.hidden = false;
  hostelEditorSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

    actionCell.appendChild(editButton);
    row.appendChild(actionCell);
    hostelManagementTableBody.appendChild(row);
  });
}


// Filter hostel listings by name or location.
if (hostelSearch) {
  hostelSearch.addEventListener("input", () => {
    const searchTerm = hostelSearch.value
      .trim()
      .toLowerCase();

    const filteredHostels = allAdminHostels.filter((hostel) => {
      const name = String(hostel.name || "").toLowerCase();
      const location = String(hostel.location || "").toLowerCase();

      return (
        name.includes(searchTerm) ||
        location.includes(searchTerm)
      );
    });

    renderHostelManagementTable(filteredHostels);
  });
}



// Load hostel listings into the selector and management table.
async function loadHostels() {
  if (hostelSelect) {
    hostelSelect.disabled = true;
    hostelSelect.innerHTML =
      '<option value="">Loading hostels...</option>';
  }

  try {
    const result = await apiRequest("/api/admin/hostels");

    if (!result || !Array.isArray(result.hostels)) {
      throw new Error("The server returned an invalid hostel list.");
    }

    allAdminHostels = result.hostels;

    // Update the dashboard hostel total from the records returned by the server.
const hostelCountElement = document.getElementById("hostelCount");
if (hostelCountElement) {
  hostelCountElement.textContent = allAdminHostels.length.toLocaleString();
}

    // Keep the existing manager-details selector working.
    if (hostelSelect) {
      hostelSelect.innerHTML =
        '<option value="">Select a hostel</option>';

      allAdminHostels.forEach((hostel) => {
        const option = document.createElement("option");

        option.value = String(hostel.id);
        option.textContent =
          `${hostel.name} — ${hostel.location}`;

        hostelSelect.appendChild(option);
      });

      hostelSelect.disabled = false;
    }

    // Populate the new management table.
    renderHostelManagementTable(allAdminHostels);

  } catch (error) {
    console.error("HOSTFind hostel list error:", error);

    if (hostelSelect) {
      hostelSelect.innerHTML =
        '<option value="">Unable to load hostels</option>';
      hostelSelect.disabled = false;
    }

    if (hostelManagementTableBody) {
      hostelManagementTableBody.innerHTML = `
        <tr>
          <td colspan="8">Unable to load hostel listings.</td>
        </tr>
      `;
    }

    showFormMessage(error.message, true);
  }
}

  // Load saved manager details from the admin API.
async function loadManagerDetails(hostelId) {
  clearManagerForm();

  if (!hostelId) {
    showFormMessage("");
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
  }

  showFormMessage("Loading manager details...");

  try {
    const result = await apiRequest(
      `/api/admin/hostels/${encodeURIComponent(hostelId)}/manager`
    );

    const details = result.details || {};

    managerFields.forEach((fieldName) => {
      const input = document.getElementById(fieldName);

      if (input) {
        input.value = details[fieldName] || "";
      }
    });

    showFormMessage("Manager details loaded successfully.");
  } catch (error) {
    console.error("HOSTFind manager details loading error:", error);

    clearManagerForm();
    showFormMessage(error.message, true);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Manager Details";
    }
  }
}



// Load saved manager details from the admin API.
async function loadManagerDetails(hostelId) {
  clearManagerForm();

  if (!hostelId) {
    showFormMessage("");
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
  }

  showFormMessage("Loading manager details...");

  try {
    const result = await apiRequest(
      `/api/admin/hostels/${encodeURIComponent(hostelId)}/manager`
    );

    const details = result.details || {};

    managerFields.forEach((fieldName) => {
      const input = document.getElementById(fieldName);

      if (input) {
        input.value = details[fieldName] || "";
      }
    });

    showFormMessage("Manager details loaded successfully.");
  } catch (error) {
    console.error("HOSTFind manager details loading error:", error);

    clearManagerForm();
    showFormMessage(error.message, true);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Manager Details";
    }
  }
}

// Load manager details whenever the selected hostel changes.
if (hostelSelect) {
  hostelSelect.addEventListener("change", () => {
    loadManagerDetails(hostelSelect.value);
  });
}




  // Save new manager details or update an existing record.
  if (managerForm) {
    managerForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const hostelId = hostelSelect ? hostelSelect.value : "";

      if (!hostelId) {
        showFormMessage("Please select a hostel first.", true);
        return;
      }

      const details = {};

      // Send all fields, including empty ones, to avoid accidental
      // ambiguity about which values are being saved.
      managerFields.forEach((fieldName) => {
        const input = document.getElementById(fieldName);

        details[fieldName] = input ? input.value.trim() : "";
        
      });

      console.log("HOSTFind form values:", details);

      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
      }

      showFormMessage("Saving manager details...");

      try {
        const result = await apiRequest(
          `/api/admin/hostels/${encodeURIComponent(hostelId)}/manager`,
          {
            method: "PUT",
            body: JSON.stringify(details)
          }
        );

        showFormMessage(
          result.message || "Manager details saved successfully."
        );

        // Refresh the dashboard figures after saving.
        await loadDashboardStats();
      } catch (error) {
        console.error("HOSTFind manager save error:", error);

        showFormMessage(error.message, true);
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = "Save Manager Details";
        }
      }
    });
  } else {
    console.error("HOSTFind manager details form was not found.");
  }

  // Load dashboard information.
  loadDashboardStats();
  loadHostels();


// Open the editor to create a new hostel listing.
if (addHostelButton) {
  addHostelButton.addEventListener("click", () => {
    if (hostelEditorForm) {
      hostelEditorForm.reset();

      const hostelIdField = document.getElementById("editHostelId");

      if (hostelIdField) {
        hostelIdField.value = "";
      }
    }

    if (hostelEditorTitle) {
      hostelEditorTitle.textContent = "Add New Hostel";
    }

    if (saveHostelButton) {
      saveHostelButton.textContent = "Add Hostel";
    }

    if (hostelEditorMessage) {
      hostelEditorMessage.textContent = "";
    }

    if (hostelEditorSection) {
      hostelEditorSection.hidden = false;
      hostelEditorSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });
}



// Cancel hostel editing without saving changes.
if (cancelHostelEditButton) {
  cancelHostelEditButton.addEventListener("click", () => {
    if (hostelEditorForm) {
      hostelEditorForm.reset();
    }

    if (hostelEditorSection) {
      hostelEditorSection.hidden = true;
    }

    if (hostelEditorMessage) {
      hostelEditorMessage.textContent = "";
    }

    if (hostelEditorTitle) {
      hostelEditorTitle.textContent = "Edit Hostel Listing";
    }
  });
}



 // Create a new hostel or update an existing public hostel listing.
if (hostelEditorForm) {
  hostelEditorForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const hostelId = document.getElementById("editHostelId").value.trim();
    const isCreating = !hostelId;

    // Convert newline-separated values into arrays.
    const linesToArray = (value) =>
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

    // Collect the form values.
    const hostelData = {
      name: document.getElementById("editHostelName").value.trim(),
      location: document.getElementById("editHostelLocation").value.trim(),
      price: Number(document.getElementById("editHostelPrice").value),
      roomType: document.getElementById("editHostelRoomType").value.trim(),
      availabilityStatus:
        document.getElementById("editHostelAvailability").value,
      availabilityMessage:
        document.getElementById("editHostelAvailabilityMessage").value.trim(),
      images: linesToArray(
        document.getElementById("editHostelImages").value
      ),
      video: document.getElementById("editHostelVideo").value.trim(),
      amenities: linesToArray(
        document.getElementById("editHostelAmenities").value
      ),
      rules: linesToArray(
        document.getElementById("editHostelRules").value
      ),
      description:
        document.getElementById("editHostelDescription").value.trim(),
      landmarks:
        document.getElementById("editHostelLandmarks").value.trim(),
      distance:
        document.getElementById("editHostelDistance").value.trim(),
      isPublished:
        document.getElementById("editHostelPublished").value,
      isVerified:
        document.getElementById("editHostelVerified").value
    };

    if (saveHostelButton) {
      saveHostelButton.disabled = true;
      saveHostelButton.textContent = isCreating
        ? "Adding Hostel..."
        : "Saving...";
    }

    if (hostelEditorMessage) {
      hostelEditorMessage.textContent = isCreating
        ? "Creating new hostel listing..."
        : "Saving hostel changes...";
      hostelEditorMessage.style.color = "#475467";
    }

    try {
      const url = isCreating
        ? "/api/admin/hostels"
        : `/api/admin/hostels/${encodeURIComponent(hostelId)}`;

      const result = await apiRequest(url, {
        method: isCreating ? "POST" : "PUT",
        body: JSON.stringify(hostelData)
      });

      await loadHostels();

      if (hostelEditorSection) {
        hostelEditorSection.hidden = true;
      }

      hostelEditorForm.reset();

      if (hostelEditorTitle) {
        hostelEditorTitle.textContent = "Edit Hostel Listing";
      }

      if (hostelManagementMessage) {
        hostelManagementMessage.textContent =
          result.message ||
          (isCreating
            ? "New hostel listing created successfully."
            : "Hostel listing updated successfully.");
        hostelManagementMessage.style.color = "#16794b";
      }

      if (hostelEditorMessage) {
        hostelEditorMessage.textContent = "";
      }
    } catch (error) {
      if (hostelEditorMessage) {
        hostelEditorMessage.textContent = error.message;
        hostelEditorMessage.style.color = "#b42318";
      }
    } finally {
      if (saveHostelButton) {
        saveHostelButton.disabled = false;
        saveHostelButton.textContent = "Save Hostel Changes";
      }
    }
  });
}



  // Handle administrator logout.
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      const confirmed = window.confirm(
        "Are you sure you want to log out of HOSTFind Admin?"
      );

      if (!confirmed) return;

      logoutButton.disabled = true;
      logoutButton.textContent = "Logging out...";

      try {
        const result = await apiRequest("/api/admin/logout", {
          method: "POST"
        });

        if (result.success) {
          window.location.replace("/admin/login");
        }
      } catch (error) {
        console.error("HOSTFind logout failed:", error);

        if (!error.message.includes("session expired")) {
          window.alert(error.message || "Logout failed. Please try again.");
        }
      } finally {
        logoutButton.disabled = false;
        logoutButton.textContent = "Log out";
      }
    });
  } else {
    console.error("HOSTFind logout button was not found.");
  }






});