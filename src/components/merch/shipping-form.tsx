"use client";

import { useEffect, useState } from "react";
import { countryData, toTitleCase, US_STATES } from "@/lib/merch/country-data";
import type { ShippingFormState } from "@/lib/merch/types";

type ShippingFormProps = {
  form: ShippingFormState;
  setForm: React.Dispatch<React.SetStateAction<ShippingFormState>>;
  isValid: boolean;
  setIsValid: (valid: boolean) => void;
};

const inputClass =
  "w-full rounded-lg border border-border bg-bg-deep px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent-gold/50";

export function ShippingForm({ form, setForm, setIsValid }: ShippingFormProps) {
  const [saveDetails, setSaveDetails] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("buxdao_shipping");
    if (saved) {
      setForm(JSON.parse(saved) as ShippingFormState);
      setSaveDetails(true);
    }
  }, [setForm]);

  useEffect(() => {
    const requiredFields = [
      "firstName",
      "lastName",
      "email",
      "country",
      "dialCode",
      "address1",
      "city",
      "state",
      "postalCode",
    ] as const;
    const allFilled = requiredFields.every((field) => form[field]?.trim());
    const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email);
    const countryObj = countryData.find((country) => country.name === form.country);
    const dialCodeMatches = Boolean(countryObj && countryObj.dial_code === form.dialCode);
    setIsValid(allFilled && emailValid && dialCodeMatches);
  }, [form, setIsValid]);

  useEffect(() => {
    if (saveDetails) {
      localStorage.setItem("buxdao_shipping", JSON.stringify(form));
    } else {
      localStorage.removeItem("buxdao_shipping");
    }
  }, [form, saveDetails]);

  const selectedCountry = countryData.find((country) => country.name === form.country);

  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
        Shipping & Contact
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="First Name*"
          value={form.firstName}
          onChange={(event) =>
            setForm((current) => ({ ...current, firstName: toTitleCase(event.target.value) }))
          }
        />
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Last Name*"
          value={form.lastName}
          onChange={(event) =>
            setForm((current) => ({ ...current, lastName: toTitleCase(event.target.value) }))
          }
        />
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Email Address*"
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />
        <select
          className={`${inputClass} sm:col-span-2`}
          value={form.country}
          onChange={(event) => {
            const country = event.target.value;
            const countryObj = countryData.find((entry) => entry.name === country);
            setForm((current) => ({
              ...current,
              country,
              dialCode: countryObj?.dial_code ?? "",
            }));
          }}
        >
          <option value="">Country*</option>
          {countryData.map((country) => (
            <option key={country.code} value={country.name}>
              {country.name}
            </option>
          ))}
        </select>
        <div className={`${inputClass} flex items-center sm:col-span-2`}>
          {selectedCountry ? (
            <span className="mr-2 flex items-center select-none">
              <span className="mr-1 text-lg">{selectedCountry.flag}</span>
              <span className="font-medium">{selectedCountry.dial_code}</span>
            </span>
          ) : null}
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="Phone Number (optional)"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            type="tel"
          />
        </div>
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Address Line 1*"
          value={form.address1}
          onChange={(event) =>
            setForm((current) => ({ ...current, address1: toTitleCase(event.target.value) }))
          }
        />
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Address Line 2 (optional)"
          value={form.address2}
          onChange={(event) =>
            setForm((current) => ({ ...current, address2: toTitleCase(event.target.value) }))
          }
        />
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="City*"
          value={form.city}
          onChange={(event) =>
            setForm((current) => ({ ...current, city: toTitleCase(event.target.value) }))
          }
        />
        {form.country === "United States" ? (
          <select
            className={`${inputClass} sm:col-span-2`}
            value={form.state}
            onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
          >
            <option value="">State*</option>
            {US_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={`${inputClass} sm:col-span-2`}
            placeholder="State / Province*"
            value={form.state}
            onChange={(event) =>
              setForm((current) => ({ ...current, state: toTitleCase(event.target.value) }))
            }
          />
        )}
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Postal Code*"
          value={form.postalCode}
          onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))}
        />
      </div>
      <label className="mt-4 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={saveDetails}
          onChange={(event) => setSaveDetails(event.target.checked)}
        />
        Save shipping details for next time
      </label>
    </div>
  );
}
