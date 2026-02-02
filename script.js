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
form.addEventListener("submit", (event) => {
  event.preventDefault();
  alert("Thanks! We'll reach out within one business day.");
});

const pricingMap = {
  basic: {
    1: [350, 350],
    2: [450, 450],
    3: [650, 650],
    4: [850, 850],
  },
  deep: {
    1: [450, 450],
    2: [550, 550],
    3: [750, 750],
    4: [950, 950],
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
const bookingBedrooms = document.querySelector("#bookingBedrooms");
const bookingCleanType = document.querySelector("#bookingCleanType");
const serviceLabel = document.querySelector("#serviceLabel");
const servicePrice = document.querySelector("#servicePrice");
const addonPrice = document.querySelector("#addonPrice");
const subtotalPrice = document.querySelector("#subtotalPrice");
const totalPrice = document.querySelector("#totalPrice");

const updateBookingForm = () => {
  if (!bookingForm || !bookingBedrooms) {
    return;
  }

  const size = bookingBedrooms.value;
  const cleanType = bookingCleanType ? bookingCleanType.value : "deep";
  const baseRange = pricingMap[cleanType]?.[size] || [0, 0];
  const addOns = Array.from(bookingForm.querySelectorAll(".addons-clean input:checked"));
  const addOnTotal = addOns.reduce((sum, checkbox) => sum + Number(checkbox.value || 0), 0);

  const minTotal = baseRange[0] + addOnTotal;
  const maxTotal = baseRange[1] + addOnTotal;

  if (serviceLabel) {
    const label = cleanType === "basic" ? "Light clean" : "Deep clean";
    serviceLabel.textContent = `${label} (${size} bedroom${size === "1" ? "" : "s"})`;
  }

  if (servicePrice) {
    servicePrice.textContent = formatPrice(baseRange[0], baseRange[1]);
  }

  if (addonPrice) {
    addonPrice.textContent = addOnTotal === 0 ? "R0" : formatZar(addOnTotal);
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
    alert("Thanks! We'll confirm availability and final pricing shortly.");
  });
  updateBookingForm();
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
      const sasResponse = await fetch("https://prod-kz-fn-email-processor.azurewebsites.net/api/get-upload-sas", {
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

      const notifyResponse = await fetch("https://prod-kz-fn-email-processor.azurewebsites.net/api/send-upload-email", {
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
