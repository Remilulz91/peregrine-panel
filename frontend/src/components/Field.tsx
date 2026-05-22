import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Used to link the label and the input together. */
  id: string;
  /** The visible label text. */
  label: string;
}

/** A labelled text input, styled for the Peregrine dark theme. */
export default function Field({ id, label, ...inputProps }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-peregrine-400"
      >
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-peregrine-600 focus:border-falcon"
      />
    </div>
  );
}
