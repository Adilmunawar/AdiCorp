import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Command, containsFilter, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDepartments, useEmployees } from "../api/employees";
import { useCreateDepartment, validateDepartmentName } from "../api/departments";
import { errorMessage } from "../lib/utils";
import { EmployeeAvatar } from "./common";

const NONE = "__none__";

/** Department select with an inline "new department" control (HR). */
export function DepartmentSelect({
  id,
  value,
  onChange,
  allowCreate = true,
  placeholder = "No department",
  className,
}: {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  allowCreate?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { data: departments = [], isLoading } = useDepartments();
  const create = useCreateDepartment();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = async () => {
    // Enter in the field bypasses the disabled Add button.
    if (create.isPending) return;
    const problem = validateDepartmentName(name, departments);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      const dept = await create.mutateAsync(name);
      onChange(dept.id);
      setAdding(false);
      setName("");
      toast.success(`Department ${dept.name} created`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not create the department"));
    }
  };

  if (adding) {
    return (
      <div className={cn("flex gap-2", className)}>
        <Input
          id={id}
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape") setAdding(false);
          }}
          placeholder="New department name"
          className="h-10 rounded-xl"
        />
        <Button type="button" size="sm" className="h-10" onClick={submit} disabled={create.isPending}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => setAdding(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  // Until the list arrives the chosen department has no matching option. Inside a <form>, Radix
  // Select then reports an empty value through its hidden native select, which silently cleared
  // the department on the edit page. Show a placeholder trigger until the options exist, and
  // ignore empty values (the "No department" option uses NONE, never "").
  if (isLoading) {
    return (
      <div className={cn("flex gap-2", className)}>
        <div id={id} aria-busy="true" className="flex h-10 min-w-0 flex-1 items-center rounded-xl border border-input bg-background px-3 text-sm text-muted-foreground">
          Loading departments…
        </div>
        {allowCreate && <div className="h-10 w-10 shrink-0 rounded-xl border border-input bg-muted/40" aria-hidden />}
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Select
        value={value || NONE}
        onValueChange={(v) => {
          if (!v) return;
          onChange(v === NONE ? "" : v);
        }}
      >
        <SelectTrigger id={id} className="h-10 min-w-0 flex-1 rounded-xl">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {allowCreate && (
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => setAdding(true)} aria-label="New department">
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** Searchable employee combobox (active employees by default). */
export function EmployeePicker({
  id,
  value,
  onChange,
  includeSeparated = false,
  exclude = [],
  placeholder = "Choose an employee",
  className,
}: {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  includeSeparated?: boolean;
  exclude?: string[];
  placeholder?: string;
  className?: string;
}) {
  const { data: employees = [], isLoading } = useEmployees();
  const [open, setOpen] = useState(false);
  const options = useMemo(
    () => employees.filter((e) => (includeSeparated || e.status === "active") && !exclude.includes(e.id)),
    [employees, includeSeparated, exclude],
  );
  const selected = employees.find((e) => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading}
          className={cn("h-10 w-full justify-between rounded-xl px-3 font-normal hover:translate-y-0", className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <EmployeeAvatar name={selected.name} src={selected.avatar_url} className="h-6 w-6 rounded-lg" />
              <span className="truncate text-sm">{selected.name}</span>
              {selected.employee_code && <span className="shrink-0 text-[11px] text-muted-foreground">{selected.employee_code}</span>}
            </span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command filter={containsFilter}>
          <CommandInput placeholder="Search name, code or position…" />
          <CommandList>
            <CommandEmpty>No one matches.</CommandEmpty>
            <CommandGroup>
              {options.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.name} ${e.employee_code ?? ""} ${e.rank}`}
                  onSelect={() => {
                    onChange(e.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <EmployeeAvatar name={e.name} src={e.avatar_url} className="h-7 w-7 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{e.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[e.employee_code, e.rank].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Check className={cn("h-4 w-4", value === e.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
