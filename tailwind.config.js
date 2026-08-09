/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      padding: {
        1.5: "0.375rem",
        2.5: "0.625rem",
        3.5: "0.875rem",
        4.5: "1.125rem",
        5.5: "1.375rem",
        6.5: "1.625rem",
      },
      margin: {
        2.5: "0.625rem",
        3.5: "0.875rem",
        4.5: "1.125rem",
        5.5: "1.375rem",
        6.5: "1.625rem",
      },
      width: {
        10.5: "2.625rem",
      },
      height: {
        10.5: "2.625rem",
      },
      colors: {
        'app-shell': 'var(--app-shell)',
        'page-canvas': 'var(--page-canvas)',
        'surface': 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-selected': 'var(--surface-selected)',
        'surface-raised': 'var(--surface-raised)',
        'surface-border': 'var(--surface-border)',
        'foreground': 'var(--foreground)',
        'muted-foreground': 'var(--muted-foreground)',
        'faint-foreground': 'var(--faint-foreground)',
        'brand': 'var(--brand)',
        'trust': 'var(--trust)',
        'trust-soft': 'var(--trust-soft)',
        'trust-border': 'var(--trust-border)',
        'trust-hover': 'var(--trust-hover)',
      },
      boxShadow: {
        'surface': 'var(--surface-shadow)',
        'floating': 'var(--floating-shadow)',
      },
    },
  },
  darkMode: "class",
};
