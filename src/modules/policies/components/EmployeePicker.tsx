import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, containsFilter, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { humanize } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { LetterEmployee } from "../lib/types";

interface Props {
  id?: string;
  employees: LetterEmployee[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/** Searchable employee combobox (active people first, then those who left or are not active). */
export function EmployeePicker({ id, employees, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((e) => e.id === value) ?? null;
  const active = employees.filter((e) => e.status === "active");
  const others = employees.filter((e) => e.status !== "active");

  const item = (e: LetterEmployee) => (
    <CommandItem
      key={e.id}
      value={`${e.name} ${e.employee_code ?? ""} ${e.rank ?? ""} ${e.department?.name ?? ""}`}
      onSelect={() => {
        onChange(e.id);
        setOpen(false);
      }}
      className="gap-2"
    >
      <Check className={cn("h-4 w-4 shrink-0", value === e.id ? "opacity-100 text-primary" : "opacity-0")} aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{e.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[e.employee_code, e.rank, e.department?.name, e.status && e.status !== "active" ? humanize(e.status) : null].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between rounded-xl px-3 font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.name}${selected.employee_code ? ` · ${selected.employee_code}` : ""}` : "Choose an employee"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command filter={containsFilter}>
          <CommandInput placeholder="Search by name, ID or team…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No employee found.</CommandEmpty>
            {active.length > 0 && <CommandGroup heading="Active">{active.map(item)}</CommandGroup>}
            {others.length > 0 && <CommandGroup heading="Not active">{others.map(item)}</CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
