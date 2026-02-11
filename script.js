const sections = document.querySelectorAll(".section, .hero, .footer");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.2 }
);

sections.forEach((section, index) => {
  section.classList.add("reveal");
  section.style.transitionDelay = `${index * 0.1}s`;
  observer.observe(section);
});

const form = document.querySelector(".form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    alert("Thanks! We'll reach out within one business day.");
  });
}

const contactForm = document.querySelector(".contact-form");
const contactStatus = document.querySelector(".contact-status");

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const name = formData.get("name");
    const email = formData.get("email");
    const message = formData.get("message");

    if (!name || !email || !message) {
      if (contactStatus) {
        contactStatus.textContent = "Please add your name, email, and message.";
      }
      return;
    }

    if (contactStatus) {
      contactStatus.textContent = "Sending your enquiry...";
    }

    fetch(`${apiBase}/send-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone: formData.get("phone") || "",
        message,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to send your enquiry. Please try again.");
        }
        return response.json();
      })
      .then(() => {
        if (contactStatus) {
          contactStatus.textContent = "Thanks! We’ve received your enquiry.";
        }
        contactForm.reset();
      })
      .catch((error) => {
        if (contactStatus) {
          contactStatus.textContent = error.message || "Something went wrong. Please try again.";
        }
      });
  });
}

const pricingMap = {
  basic: {
    1: [450, 450],
    2: [550, 550],
    3: [750, 750],
    4: [950, 950],
  },
  deep: {
    1: [550, 550],
    2: [650, 650],
    3: [850, 850],
    4: [1050, 1050],
  },
  move: {
    1: [850, 850],
    2: [1050, 1050],
    3: [1550, 1550],
    4: [2050, 2050],
  },
};

const formatZar = (value) =>
  `R${value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

const formatPrice = (min, max) => (min === max ? formatZar(min) : `${formatZar(min)}–${formatZar(max)}`);

const bookingForm = document.querySelector(".booking-form");
const paymentBanner = document.querySelector(".payment-banner");
const bookingBedrooms = document.querySelector("#bookingBedrooms");
const bookingCleanType = document.querySelector("#bookingCleanType");
const bookingPropertyType = bookingForm ? bookingForm.querySelector("select[name='propertyType']") : null;
const bookingBathrooms = bookingForm ? bookingForm.querySelector("select[name='bathrooms']") : null;
const bookingAirbnbPack = bookingForm ? bookingForm.querySelector("select[name='airbnbPack']") : null;
const bookingAirbnbGuests = bookingForm ? bookingForm.querySelector("select[name='airbnbGuests']") : null;
const bookingAirbnbField = bookingForm ? bookingForm.querySelector(".airbnb-pack-field") : null;
const serviceLabel = document.querySelector("#serviceLabel");
const servicePrice = document.querySelector("#servicePrice");
const propertyTypePrice = document.querySelector("#propertyTypePrice");
const bathroomPrice = document.querySelector("#bathroomPrice");
const airbnbPackLabel = document.querySelector("#airbnbPackLabel");
const airbnbPackPrice = document.querySelector("#airbnbPackPrice");
const addonPrice = document.querySelector("#addonPrice");
const addonSummary = document.querySelector("#addonSummary");
const wallCleaningPrice = document.querySelector("#wallCleaningPrice");
const subtotalPrice = document.querySelector("#subtotalPrice");
const totalPrice = document.querySelector("#totalPrice");
const bookingStatus = document.querySelector(".booking-status");
const locationButton = document.querySelector(".location-button");
const locationStatus = document.querySelector(".location-status");

const apiBase = "https://prod-kz-fn-email-processor.azurewebsites.net/api";

let bookingTotals = {
  baseMin: 0,
  baseMax: 0,
  propertyTypeUplift: 0,
  bathroomSurcharge: 0,
  airbnbPackTotal: 0,
  addOnTotal: 0,
  totalMin: 0,
  totalMax: 0,
};

const parseBathroomCount = (value) => {
  const match = String(value || "").match(/^\d+/);
  return match ? Number(match[0]) : 0;
};

const updateBookingForm = () => {
  if (!bookingForm || !bookingBedrooms) {
    return;
  }

  const size = bookingBedrooms.value;
  const cleanType = bookingCleanType ? bookingCleanType.value : "deep";
  const baseRange = pricingMap[cleanType]?.[size] || [0, 0];
  const propertyType = bookingPropertyType ? bookingPropertyType.value : "Apartment";
  if (bookingAirbnbField && bookingAirbnbPack) {
    if (propertyType === "Airbnb") {
      bookingAirbnbField.classList.add("is-visible");
    } else {
      bookingAirbnbField.classList.remove("is-visible");
      bookingAirbnbPack.value = "";
      if (bookingAirbnbGuests) {
        bookingAirbnbGuests.value = "2";
      }
    }
  }
  const houseTypes = new Set(["House", "Townhouse", "Villa"]);
  const upliftRate = houseTypes.has(propertyType) ? 0.15 : 0;
  const upliftMin = Math.round(baseRange[0] * upliftRate);
  const upliftMax = Math.round(baseRange[1] * upliftRate);
  const adjustedBase = [baseRange[0] + upliftMin, baseRange[1] + upliftMax];

  const bathCount = parseBathroomCount(bookingBathrooms ? bookingBathrooms.value : 0);
  const extraBathrooms = Math.max(0, bathCount - 1);
  const bathRate = cleanType === "basic" ? 150 : 200;
  const bathroomSurcharge = extraBathrooms * bathRate;

  const airbnbPackPrices = { basic: 95, premium: 175, deluxe: 295 };
  const airbnbPackValue = bookingAirbnbPack ? bookingAirbnbPack.value : "";
  const airbnbGuestsValue = bookingAirbnbGuests ? Number(bookingAirbnbGuests.value || 2) : 2;
  const airbnbMultiplier = Math.max(1, Math.ceil(airbnbGuestsValue / 2));
  const airbnbBase = airbnbPackValue ? airbnbPackPrices[airbnbPackValue] || 0 : 0;
  const airbnbPackTotal = airbnbBase * airbnbMultiplier;

  const addOnInputs = Array.from(bookingForm.querySelectorAll(".addons-clean input[type='number']"));
  const addOnChecks = Array.from(bookingForm.querySelectorAll(".addons-clean input[type='checkbox']"));
  const addOnTotal = addOnInputs.reduce((sum, input) => {
    const qty = Number(input.value || 0);
    const price = Number(input.dataset.addonPrice || 0);
    return sum + qty * price;
  }, 0) + addOnChecks.reduce((sum, input) => {
    const price = Number(input.dataset.addonPrice || 0);
    return input.checked ? sum + price : sum;
  }, 0);
  const addOnList = addOnInputs
    .map((input) => {
      const qty = Number(input.value || 0);
      if (!qty) return "";
      const label = input.dataset.addonLabel || "Add-on";
      if (input.dataset.addonType === "area") {
        return `${qty} m² ${label.replace(" (m²)", "")}`;
      }
      return `${qty}x ${label}`;
    })
    .filter(Boolean)
    .concat(
      addOnChecks
        .filter((input) => input.checked)
        .map((input) => input.dataset.addonLabel || "Add-on")
    );

  const minTotal = adjustedBase[0] + bathroomSurcharge + airbnbPackTotal + addOnTotal;
  const maxTotal = adjustedBase[1] + bathroomSurcharge + airbnbPackTotal + addOnTotal;
  bookingTotals = {
    baseMin: adjustedBase[0],
    baseMax: adjustedBase[1],
    propertyTypeUplift: upliftMin,
    bathroomSurcharge,
    airbnbPackTotal,
    addOnTotal,
    totalMin: minTotal,
    totalMax: maxTotal,
  };

  if (serviceLabel) {
    const label = cleanType === "basic" ? "Light clean" : "Deep clean";
    serviceLabel.textContent = `${label} (${size} bedroom${size === "1" ? "" : "s"})`;
  }

  if (servicePrice) {
    servicePrice.textContent = formatPrice(adjustedBase[0], adjustedBase[1]);
  }

  if (propertyTypePrice) {
    propertyTypePrice.textContent = upliftRate ? formatPrice(upliftMin, upliftMax) : "R0";
  }

  if (bathroomPrice) {
    bathroomPrice.textContent = bathroomSurcharge ? formatZar(bathroomSurcharge) : "R0";
  }

  if (airbnbPackPrice) {
    airbnbPackPrice.textContent = airbnbPackTotal ? formatZar(airbnbPackTotal) : "R0";
  }
  if (airbnbPackLabel) {
    const guestSuffix = airbnbPackValue ? ` (${airbnbGuestsValue} guests)` : "";
    airbnbPackLabel.textContent = `Airbnb welcome pack${guestSuffix}`;
  }

  const wallInput = bookingForm.querySelector(".addons-clean input[data-addon-type='area']");
  const wallQty = wallInput ? Number(wallInput.value || 0) : 0;
  const wallCost = wallInput ? wallQty * Number(wallInput.dataset.addonPrice || 0) : 0;

  if (addonPrice) {
    const nonWallAddOns = addOnTotal - wallCost;
    addonPrice.textContent = nonWallAddOns <= 0 ? "R0" : formatZar(nonWallAddOns);
  }
  if (wallCleaningPrice) {
    wallCleaningPrice.textContent = wallCost ? formatZar(wallCost) : "R0";
  }
  if (addonSummary) {
    const airbnbPackNote = airbnbPackValue
      ? `Airbnb welcome pack (${airbnbPackValue}, ${airbnbGuestsValue} guests)`
      : "";
    const combined = addOnList.concat(airbnbPackNote ? [airbnbPackNote] : []);
    addonSummary.textContent = combined.length ? `(${combined.join(", ")})` : "";
  }

  if (subtotalPrice) {
    subtotalPrice.textContent = formatPrice(minTotal, maxTotal);
  }

  if (totalPrice) {
    totalPrice.textContent = formatPrice(minTotal, maxTotal);
  }
};

if (bookingForm) {
  bookingForm.addEventListener("change", updateBookingForm);
  bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(bookingForm);
    const email = formData.get("email");
    const address = formData.get("address");
    const suburb = formData.get("suburb");
    const paymentMethod = formData.get("paymentMethod");

    if (!email || !address || !suburb) {
      if (bookingStatus) {
        bookingStatus.textContent = "Please add your email, address, and suburb to continue.";
      }
      return;
    }

    const submitButton = bookingForm.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
    }

    if (bookingStatus) {
      bookingStatus.textContent = "Preparing your quote...";
    }

    const addOnLabels = Array.from(bookingForm.querySelectorAll(".addons-clean input[type='number']"))
      .map((input) => {
        const qty = Number(input.value || 0);
        if (!qty) return "";
        const label = input.dataset.addonLabel || "Add-on";
        if (input.dataset.addonType === "area") {
          return `Wall cleaning × ${qty} m²`;
        }
        return `${label} × ${qty}`;
      })
      .filter(Boolean)
      .concat(
        Array.from(bookingForm.querySelectorAll(".addons-clean input[type='checkbox']:checked")).map(
          (input) => input.dataset.addonLabel || "Add-on"
        )
      );
    const airbnbPackValue = formData.get("airbnbPack");
    const airbnbGuestsValue = Number(formData.get("airbnbGuests") || 2);
    if (airbnbPackValue) {
      const packLabel = `Airbnb welcome pack (${airbnbPackValue}, ${airbnbGuestsValue} guests)`;
      addOnLabels.push(packLabel);
    }

    const payload = {
      email,
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      address,
      suburb,
      cleanType: formData.get("cleanType"),
      propertyType: formData.get("propertyType"),
      bedrooms: formData.get("bedrooms"),
      bathrooms: formData.get("bathrooms"),
      occupancy: formData.get("occupancy"),
      addOns: addOnLabels.filter(Boolean),
      airbnbPack: airbnbPackValue,
      airbnbGuests: airbnbGuestsValue,
      airbnbPackTotal: bookingTotals.airbnbPackTotal,
      basePrice: bookingTotals.baseMin === bookingTotals.baseMax ? bookingTotals.baseMin : bookingTotals.baseMin,
      propertyTypeUplift: bookingTotals.propertyTypeUplift,
      bathroomSurcharge: bookingTotals.bathroomSurcharge,
      addOnTotal: bookingTotals.addOnTotal,
      totalMin: bookingTotals.totalMin,
      totalMax: bookingTotals.totalMax,
      bookingDate: formData.get("bookingDate"),
      bookingTime: formData.get("bookingTime"),
      paymentMethod,
    };

    fetch(`${apiBase}/create-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Quote request failed. Please try again.");
        }
        return response.json();
      })
      .then((data) => {
        if (paymentMethod === "payfast") {
          if (bookingStatus) {
            bookingStatus.textContent = "Redirecting you to Payfast...";
          }
          return fetch(`${apiBase}/payfast-prepare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingId: data.bookingId, email }),
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error("Unable to start Payfast payment. Please try again.");
              }
              return response.json();
            })
            .then((payfast) => {
              const formEl = document.createElement("form");
              formEl.method = "POST";
              formEl.action = payfast.payfastUrl;
              Object.entries(payfast.fields || {}).forEach(([key, value]) => {
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = key;
                input.value = value;
                formEl.appendChild(input);
              });
              document.body.appendChild(formEl);
              formEl.submit();
            });
        }

        if (bookingStatus) {
          bookingStatus.textContent =
            "Quote sent! Check your email for your secure gallery link and booking summary.";
        }
        bookingForm.reset();
        updateBookingForm();
      })
      .catch((error) => {
        if (bookingStatus) {
          bookingStatus.textContent = error.message || "Something went wrong. Please try again.";
        }
      })
      .finally(() => {
        if (submitButton) {
          submitButton.disabled = false;
        }
      });
  });
  const bookingParams = new URLSearchParams(window.location.search);
  const cleanTypeParam = bookingParams.get("cleanType");
  const bedroomsParam = bookingParams.get("bedrooms");
  const paidParam = bookingParams.get("paid");
  if (paymentBanner && paidParam === "1") {
    paymentBanner.hidden = false;
  }
  if (cleanTypeParam && bookingCleanType) {
    bookingCleanType.value = cleanTypeParam;
  }
  if (bedroomsParam && bookingBedrooms) {
    bookingBedrooms.value = bedroomsParam;
  }
  const propertyParam = bookingParams.get("propertyType");
  if (propertyParam && bookingPropertyType) {
    bookingPropertyType.value = propertyParam;
  }
  const packParam = bookingParams.get("airbnbPack");
  if (packParam && bookingAirbnbPack) {
    bookingAirbnbPack.value = packParam;
  }
  const guestsParam = bookingParams.get("airbnbGuests");
  if (guestsParam && bookingAirbnbGuests) {
    bookingAirbnbGuests.value = guestsParam;
  }
  updateBookingForm();
}

if (locationButton) {
  locationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      if (locationStatus) {
        locationStatus.textContent = "Location is not supported on this device.";
      }
      return;
    }

    if (locationStatus) {
      locationStatus.textContent = "Detecting your location...";
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latInput = bookingForm?.querySelector("input[name='lat']");
        const lngInput = bookingForm?.querySelector("input[name='lng']");
        if (latInput) latInput.value = String(pos.coords.latitude);
        if (lngInput) lngInput.value = String(pos.coords.longitude);
        if (locationStatus) {
          locationStatus.textContent =
            "Location detected. Please confirm your street address and suburb.";
        }
      },
      () => {
        if (locationStatus) {
          locationStatus.textContent = "Unable to detect location. Please enter address manually.";
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

const listingForm = document.querySelector(".listing-form");
const listingStatus = document.querySelector(".listing-status");

const setListingStatus = (message) => {
  if (listingStatus) {
    listingStatus.textContent = message;
  }
};

const sanitizePathPart = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

if (listingForm) {
  listingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(listingForm);
    const clientEmail = formData.get("clientEmail");
    const listingId = formData.get("listingId");
    const apartmentSize = formData.get("apartmentSize");
    const cleaningType = formData.get("cleaningType");
    const notes = formData.get("notes");
    const files = listingForm.querySelector("input[name='photos']").files;
    const extras = Array.from(listingForm.querySelectorAll(".extras-grid input:checked")).map((input) => input.value);

    if (!clientEmail || !listingId || !files.length) {
      setListingStatus("Please fill in the required fields and add at least one photo.");
      return;
    }

    const submitButton = listingForm.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
    }

    setListingStatus("Preparing uploads...");

    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeListing = sanitizePathPart(listingId);

    try {
      const uploadedUrls = [];

      for (const file of files) {
      const sasResponse = await fetch(`${apiBase}/get-upload-sas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEmail,
          listingId: safeListing,
          date: dateStamp,
          fileName: file.name,
          contentType: file.type,
        }),
      });

        if (!sasResponse.ok) {
          throw new Error("Unable to prepare upload.");
        }

        const { sasUrl, blobUrl } = await sasResponse.json();

        const uploadResponse = await fetch(sasUrl, {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload failed. Please try again.");
        }

        uploadedUrls.push(blobUrl);
      }

      setListingStatus("Sending confirmation email...");

      const notifyResponse = await fetch(`${apiBase}/send-upload-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEmail,
          listingId,
          apartmentSize,
          cleaningType,
          extras,
          notes,
          date: dateStamp,
          files: uploadedUrls,
        }),
      });

      if (!notifyResponse.ok) {
        throw new Error("Uploads completed, but email failed.");
      }

      setListingStatus("All set! Uploads complete and emails sent.");
      listingForm.reset();
    } catch (error) {
      setListingStatus(error.message || "Something went wrong. Please try again.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

const magicLinkForm = document.querySelector(".magic-link-form");
const magicLinkStatus = document.querySelector(".magic-link-status");
const gallerySummary = document.querySelector("#gallerySummary");
const galleryBefore = document.querySelector("#galleryBefore");
const galleryAfter = document.querySelector("#galleryAfter");
const galleryDispute = document.querySelector("#galleryDispute");
const disputeForm = document.querySelector(".dispute-form");
const disputeStatus = document.querySelector(".dispute-status");
const adminUploadForm = document.querySelector(".admin-upload-form");
const adminUploadStatus = document.querySelector(".admin-upload-status");
const adminLinkForm = document.querySelector(".admin-link-form");
const adminLinkStatus = document.querySelector(".admin-link-status");

let activeToken = null;
let adminToken = null;

const renderGalleryStrip = (container, items) => {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "price-note";
    empty.textContent = "No images yet.";
    container.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.name || "Gallery image";
    container.appendChild(img);
  });
};

const loadGallery = (token) => {
  activeToken = token;
  fetch(`${apiBase}/get-gallery?token=${encodeURIComponent(token)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load gallery. Please request a new link.");
      }
      return response.json();
    })
    .then((data) => {
      if (gallerySummary) {
        gallerySummary.textContent = `Booking ${data.booking?.id || ""} · ${data.booking?.cleanType || ""} · ${
          data.booking?.bedrooms || ""
        } bedrooms`;
      }
      renderGalleryStrip(galleryBefore, data.gallery?.before || []);
      renderGalleryStrip(galleryAfter, data.gallery?.after || []);
      renderGalleryStrip(galleryDispute, data.gallery?.dispute || []);
    })
    .catch((error) => {
      if (gallerySummary) {
        gallerySummary.textContent = error.message || "Unable to load gallery.";
      }
    });
};

if (magicLinkForm) {
  magicLinkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(magicLinkForm);
    const email = formData.get("email");

    if (!email) {
      if (magicLinkStatus) {
        magicLinkStatus.textContent = "Please enter your email address.";
      }
      return;
    }

    if (magicLinkStatus) {
      magicLinkStatus.textContent = "Sending your secure link...";
    }

    fetch(`${apiBase}/request-magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to send the link. Please contact support.");
        }
        return response.json();
      })
      .then(() => {
        if (magicLinkStatus) {
          magicLinkStatus.textContent = "Check your inbox for your secure gallery link.";
        }
        magicLinkForm.reset();
      })
      .catch((error) => {
        if (magicLinkStatus) {
          magicLinkStatus.textContent = error.message || "Unable to send link.";
        }
      });
  });
}

if (adminLinkForm) {
  adminLinkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(adminLinkForm);
    const email = formData.get("email");

    if (!email) {
      if (adminLinkStatus) {
        adminLinkStatus.textContent = "Please enter your admin email.";
      }
      return;
    }

    if (adminLinkStatus) {
      adminLinkStatus.textContent = "Sending admin link...";
    }

    fetch(`${apiBase}/request-admin-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to send admin link.");
        }
        return response.json();
      })
      .then(() => {
        if (adminLinkStatus) {
          adminLinkStatus.textContent = "Check your inbox for the admin link.";
        }
        adminLinkForm.reset();
      })
      .catch((error) => {
        if (adminLinkStatus) {
          adminLinkStatus.textContent = error.message || "Unable to send admin link.";
        }
      });
  });
}

if (disputeForm) {
  disputeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeToken) {
      if (disputeStatus) {
        disputeStatus.textContent = "Please open your secure gallery link first.";
      }
      return;
    }

    const files = disputeForm.querySelector("input[name='disputePhotos']").files;
    const notes = disputeForm.querySelector("textarea[name='disputeNotes']")?.value || "";
    if (!files.length) {
      if (disputeStatus) {
        disputeStatus.textContent = "Please select at least one photo.";
      }
      return;
    }

    if (disputeStatus) {
      disputeStatus.textContent = "Uploading dispute photos...";
    }

    try {
      const uploadedUrls = [];
      for (const file of files) {
        const sasResponse = await fetch(`${apiBase}/get-dispute-upload-sas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: activeToken,
            fileName: file.name,
            contentType: file.type,
          }),
        });

        if (!sasResponse.ok) {
          throw new Error("Unable to prepare dispute upload.");
        }

        const { sasUrl, blobUrl } = await sasResponse.json();
        const uploadResponse = await fetch(sasUrl, {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Dispute upload failed. Please try again.");
        }

        uploadedUrls.push(blobUrl);
      }

      const notifyResponse = await fetch(`${apiBase}/submit-dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: activeToken, notes, files: uploadedUrls }),
      });

      if (!notifyResponse.ok) {
        throw new Error("Dispute submitted, but notification failed.");
      }

      if (disputeStatus) {
        disputeStatus.textContent = "Dispute submitted. We will review shortly.";
      }
      disputeForm.reset();
      loadGallery(activeToken);
    } catch (error) {
      if (disputeStatus) {
        disputeStatus.textContent = error.message || "Unable to upload dispute photos.";
      }
    }
  });
}

if (adminUploadForm) {
  adminUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(adminUploadForm);
    const email = formData.get("adminEmail");
    const bookingId = formData.get("bookingId");
    const stage = formData.get("stage");
    const files = adminUploadForm.querySelector("input[name='adminPhotos']").files;

    if (!adminToken || !email || !bookingId || !files.length) {
      if (adminUploadStatus) {
        adminUploadStatus.textContent = "Use the admin link, then fill in all fields and select photos.";
      }
      return;
    }

    if (adminUploadStatus) {
      adminUploadStatus.textContent = "Uploading before/after photos...";
    }

    try {
      for (const file of files) {
        const sasResponse = await fetch(`${apiBase}/get-admin-upload-sas`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: adminToken,
            email,
            bookingId,
            stage,
            fileName: file.name,
            contentType: file.type,
          }),
        });

        if (!sasResponse.ok) {
          throw new Error("Unable to prepare admin upload.");
        }

        const { sasUrl } = await sasResponse.json();
        const uploadResponse = await fetch(sasUrl, {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Admin upload failed. Please try again.");
        }
      }

      if (adminUploadStatus) {
        adminUploadStatus.textContent = "Upload complete.";
      }
      adminUploadForm.reset();
      if (activeToken) {
        loadGallery(activeToken);
      }
    } catch (error) {
      if (adminUploadStatus) {
        adminUploadStatus.textContent = error.message || "Unable to upload photos.";
      }
    }
  });
}

const urlToken = new URLSearchParams(window.location.search).get("token");
if (urlToken) {
  loadGallery(urlToken);
}

const urlAdminToken = new URLSearchParams(window.location.search).get("adminToken");
if (urlAdminToken) {
  adminToken = urlAdminToken;
}

const calendarGrid = document.querySelector("#calendarGrid");
const calendarMonth = document.querySelector("#calendarMonth");
const calendarNavs = document.querySelectorAll(".cal-nav");
const bookingDateInput = document.querySelector("#bookingDate");
const bookingTimeInput = document.querySelector("#bookingTime");
const timeSlots = document.querySelectorAll(".slot");

let calendarDate = new Date();
calendarDate.setDate(1);

const renderCalendar = () => {
  if (!calendarGrid || !calendarMonth) {
    return;
  }

  calendarGrid.innerHTML = "";
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const monthName = calendarDate.toLocaleString("en-ZA", { month: "long", year: "numeric" });
  calendarMonth.textContent = monthName;

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startOffset + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      button.classList.add("is-muted");
      button.textContent = "";
      button.disabled = true;
    } else {
      const dateValue = new Date(year, month, dayNumber);
      const iso = dateValue.toISOString().split("T")[0];
      button.textContent = String(dayNumber);
      button.dataset.date = iso;

      if (bookingDateInput?.value === iso) {
        button.classList.add("is-selected");
      }

      button.addEventListener("click", () => {
        bookingDateInput.value = iso;
        renderCalendar();
      });
    }

    calendarGrid.appendChild(button);
  }
};

calendarNavs.forEach((nav) => {
  nav.addEventListener("click", () => {
    const dir = Number(nav.dataset.dir || 0);
    calendarDate.setMonth(calendarDate.getMonth() + dir);
    renderCalendar();
  });
});

timeSlots.forEach((slot) => {
  slot.addEventListener("click", () => {
    timeSlots.forEach((s) => s.classList.remove("is-selected"));
    slot.classList.add("is-selected");
    if (bookingTimeInput) {
      bookingTimeInput.value = slot.textContent.trim();
    }
  });
});

renderCalendar();

const airbnbGuestSelect = document.querySelector("#airbnbGuestsSelect");
if (airbnbGuestSelect) {
  const updateAirbnbPackLinks = () => {
    const guestsValue = airbnbGuestSelect.value || "2";
    document.querySelectorAll(".airbnb-pack[data-pack]").forEach((card) => {
      const pack = card.getAttribute("data-pack");
      if (!pack) return;
      card.href = `book-a-clean.html?propertyType=Airbnb&airbnbPack=${encodeURIComponent(pack)}&airbnbGuests=${encodeURIComponent(guestsValue)}`;
    });
  };

  airbnbGuestSelect.addEventListener("change", updateAirbnbPackLinks);
  updateAirbnbPackLinks();
}
