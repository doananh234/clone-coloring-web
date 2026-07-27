export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

export interface TabsProps<K extends string = string> {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
}

export function Tabs<K extends string = string>({ items, value, onChange }: TabsProps<K>) {
  return (
    <div className="mo-tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={value === it.key}
          className={`mo-tab${value === it.key ? " mo-tab--active" : ""}`}
          onClick={() => onChange(it.key)}
        >
          {it.label}
          {it.count != null && <span className="mo-tab__count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
