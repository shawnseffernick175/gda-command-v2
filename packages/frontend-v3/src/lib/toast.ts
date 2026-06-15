"use client";

type ToastType = "success" | "error";

const TOAST_DURATION = 3500;

function createToast(message: string, type: ToastType) {
  const container = getOrCreateContainer();
  const el = document.createElement("div");
  el.className = [
    "toast-item",
    "animate-in",
    type === "error" ? "toast-error" : "toast-success",
  ].join(" ");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add("animate-out");
    el.addEventListener("animationend", () => el.remove());
  }, TOAST_DURATION);
}

function getOrCreateContainer(): HTMLElement {
  const existing = document.getElementById("toast-container");
  if (existing) return existing;
  const container = document.createElement("div");
  container.id = "toast-container";
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}

export const toast = {
  success(message: string) {
    createToast(message, "success");
  },
  error(message: string) {
    createToast(message, "error");
  },
};
