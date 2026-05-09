export function Form({ children }) {
  return children;
}

export function FormField({ render }) {
  return render?.() ?? null;
}

export function FormItem({ className = "", ...props }) {
  return <div className={`form-item ${className}`} {...props} />;
}

export function FormLabel(props) {
  return <label className="form-label" {...props} />;
}

export function FormControl({ children }) {
  return children;
}

export function FormMessage({ className = "", ...props }) {
  return <p className={`form-message ${className}`} {...props} />;
}
