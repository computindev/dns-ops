import { jsx, jsxs } from 'react/jsx-runtime';
import { useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';

const j = function() {
  const h = useNavigate(), i = useId(), d = useId(), [l, f] = useState(""), [n, b] = useState(""), [c, t] = useState(""), [m, o] = useState(false);
  return jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-50", children: jsx("div", { className: "max-w-md w-full", children: jsxs("div", { className: "bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10", children: [jsx("div", { className: "sm:mx-auto sm:w-full sm:max-w-md", children: jsx("h2", { className: "mt-6 text-center text-3xl font-extrabold text-gray-900", children: "Sign in to DNS Ops" }) }), jsxs("form", { className: "mt-8 space-y-6", onSubmit: async (a) => {
    if (a.preventDefault(), t(""), o(true), !l || !n) {
      t("Email and password are required"), o(false);
      return;
    }
    try {
      const u = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: l, password: n }) }), g = await u.json();
      u.ok ? h({ to: "/" }) : t(g.error || "Login failed");
    } catch {
      t("Network error. Please try again.");
    } finally {
      o(false);
    }
  }, children: [jsxs("div", { children: [jsx("label", { htmlFor: i, className: "block text-sm font-medium text-gray-700", children: "Email address" }), jsx("div", { className: "mt-1", children: jsx("input", { id: i, name: "email", type: "email", autoComplete: "email", required: true, value: l, onChange: (a) => f(a.target.value), className: "appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm", placeholder: "you@yourcompany.com" }) })] }), jsxs("div", { children: [jsx("label", { htmlFor: d, className: "block text-sm font-medium text-gray-700", children: "Password" }), jsx("div", { className: "mt-1", children: jsx("input", { id: d, name: "password", type: "password", autoComplete: "current-password", required: true, minLength: 8, value: n, onChange: (a) => b(a.target.value), className: "appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" }) })] }), c && jsx("div", { className: "text-sm text-red-600", children: c }), jsx("div", { children: jsx("button", { type: "submit", disabled: m, className: "w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400", children: m ? "Please wait..." : "Sign in" }) })] }), jsx("div", { className: "mt-6", children: jsxs("div", { className: "relative", children: [jsx("div", { className: "absolute inset-0 flex items-center", children: jsx("div", { className: "w-full border-t border-gray-300" }) }), jsx("div", { className: "relative flex justify-center text-sm", children: jsx("span", { className: "px-2 bg-white text-gray-500", children: "DNS Ops Workbench" }) })] }) })] }) }) });
};

export { j as component };
//# sourceMappingURL=login-CJz8182m.mjs.map
