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