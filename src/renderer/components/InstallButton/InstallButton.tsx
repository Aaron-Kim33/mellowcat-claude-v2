interface InstallButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export function InstallButton({ onClick, disabled, label = "Install" }: InstallButtonProps) {
  return (
    <button type="button" className="primary-button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
