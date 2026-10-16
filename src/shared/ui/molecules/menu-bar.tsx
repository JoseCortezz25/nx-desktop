import { Button } from '../atoms/button';
import './menu-bar.css';

export interface MenuBarItem {
  readonly id: string;
  readonly label: string;
}

export interface MenuBarProps {
  readonly items: readonly MenuBarItem[];
  readonly onSelect?: (id: string) => void;
}

/** Molecule: the window menu labels. Drop-down content is a later ticket. */
export function MenuBar({ items, onSelect }: MenuBarProps) {
  return (
    <div className="menu-bar">
      {items.map(item => (
        <Button
          key={item.id}
          variant="text"
          onPress={onSelect ? () => onSelect(item.id) : undefined}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
