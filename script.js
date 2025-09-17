// ---------------------
// Modal Logic & Helpers
// ---------------------
const modal = document.getElementById('contact-modal');
const closeButton = document.querySelector('.close-button');
const contactTriggers = document.querySelectorAll('.contact-trigger');
const promptTextarea = document.getElementById('project-prompt');
const submitPromptBtn = document.getElementById('submit-prompt-btn');
const messageTextarea = document.getElementById('message');

const openModal = () => {
  if (!modal) return;
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  // Optional: lock background scroll
  document.documentElement.style.overflow = 'hidden';
};

const closeModal = () => {
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.documentElement.style.overflow = '';
};

// Attach triggers to open modal
contactTriggers.forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    // Prevent hash jumps for anchors
    if (trigger.tagName.toLowerCase() === 'a') {
      event.preventDefault();
    }
    openModal();
  });
});

// Close on X button
if (closeButton) {
  closeButton.addEventListener('click', closeModal);
  closeButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      closeModal();
    }
  });
}

// Close when clicking outside content
if (modal) {
  modal.addEventListener('click', (event) => {
    const content = modal.querySelector('.modal-content');
    if (event.target === modal && content) {
      closeModal();
    }
  });
  // Close on Escape
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
}

// ---------------------
// Prompt -> Form transfer
// ---------------------
if (submitPromptBtn) {
  submitPromptBtn.addEventListener('click', () => {
    const promptValue = promptTextarea ? promptTextarea.value.trim() : '';
    openModal();
    if (messageTextarea && promptValue.length > 0) {
      messageTextarea.value = promptValue;
    }
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.focus();
  });
}

// ---------------------
// Smooth Scrolling for in-page links
// ---------------------
const navLinks = document.querySelectorAll('a[href^="#"]');
navLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ---------------------
// Typewriter rotating placeholder in hero
// ---------------------
(() => {
  if (!promptTextarea) return;
  const examplePrompts = [
    "Costruisci una web app SaaS con pagamenti e abbonamenti.",
    "Un chatbot LLM per assistenza clienti integrato nel mio sito.",
    "Un CRM con automazioni e integrazione AI per email."
  ];
  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let timerId = null;
  const type = () => {
    const current = examplePrompts[phraseIndex % examplePrompts.length];
    const nextText = isDeleting ? current.substring(0, charIndex--) : current.substring(0, charIndex++);
    if (promptTextarea.value.trim().length === 0 && document.activeElement !== promptTextarea) {
      promptTextarea.setAttribute('placeholder', nextText);
    }
    let delay = isDeleting ? 28 : 45;
    if (!isDeleting && charIndex > current.length) {
      isDeleting = true;
      delay = 1000;
    }
    if (isDeleting && charIndex < 0) {
      isDeleting = false;
      phraseIndex++;
      charIndex = 0;
      delay = 300;
    }
    timerId = setTimeout(type, delay);
  };
  const start = () => { if (timerId === null) type(); };
  const stop = () => { if (timerId !== null) { clearTimeout(timerId); timerId = null; } };
  start();
  promptTextarea.addEventListener('focus', stop);
  promptTextarea.addEventListener('blur', () => {
    if (promptTextarea.value.trim().length === 0) start();
  });
  promptTextarea.addEventListener('input', () => {
    if (promptTextarea.value.trim().length > 0) {
      promptTextarea.setAttribute('placeholder', '');
      stop();
    } else if (document.activeElement !== promptTextarea) {
      start();
    }
  });
})();

 

// ---------------------
// Contact Form submit via mailto
// ---------------------
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const emailInput = document.getElementById('email');
    const senderEmail = emailInput ? emailInput.value.trim() : '';
    const description = messageTextarea ? messageTextarea.value.trim() : '';
    const subject = 'Richiesta info';
    const body = `Email: ${senderEmail}\nDescrizione: ${description}`;
    const mailtoLink = `mailto:elia.rmno@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;
    closeModal();
  });
}
