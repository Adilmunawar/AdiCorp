import { useMemo, useState } from "react";
import { CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { toast as sonnerToast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, timezoneOptions } from "@/modules/platform/components/form";

const formSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, { message: "Choose a currency" }),
  timezone: z.string().min(1, { message: "Choose a timezone" }),
});
type FormValues = z.infer<typeof formSchema>;

/** The browser's IANA timezone (e.g. "Europe/London"), or null when it cannot tell. */
function browserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz !== "Etc/UTC" ? tz : null;
  } catch {
    return null;
  }
}

/* A sensible first guess at the currency from where the browser is; the owner can pick any other. */
const CURRENCY_BY_REGION: Record<string, string> = {
  PK: "PKR", US: "USD", GB: "GBP", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", IN: "INR", BD: "BDT",
  LK: "LKR", TR: "TRY", EG: "EGP", NG: "NGN", KE: "KES", ZA: "ZAR", CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD", MY: "MYR",
  ID: "IDR", PH: "PHP", CN: "CNY", JP: "JPY", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", BR: "BRL", MX: "MXN",
  DE: "EUR", FR: "EUR", NL: "EUR", BE: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", AT: "EUR", IE: "EUR", FI: "EUR",
};
const CURRENCY_BY_TZ: Record<string, string> = { "Asia/Karachi": "PKR", "Asia/Dubai": "AED", "Asia/Riyadh": "SAR", "Asia/Qatar": "QAR", "Asia/Kolkata": "INR", "Asia/Dhaka": "BDT", "Europe/London": "GBP" };

function guessCurrency(tz: string | null): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && CURRENCY_BY_REGION[region]) return CURRENCY_BY_REGION[region];
  } catch {
    /* older browser */
  }
  if (tz && CURRENCY_BY_TZ[tz]) return CURRENCY_BY_TZ[tz];
  if (tz?.startsWith("America/")) return "USD";
  if (tz?.startsWith("Europe/")) return "EUR";
  return "USD";
}

interface WorkspaceSettingsFormProps {
  onComplete?: () => void;
  isEmbedded?: boolean;
}

/** Onboarding step 2: the company's currency and timezone. Both can be changed later in Settings. */
export default function WorkspaceSettingsForm({ onComplete, isEmbedded = false }: WorkspaceSettingsFormProps) {
  const { toast } = useToast();
  const { company, companyId, refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const zones = useMemo(() => timezoneOptions(), []);
  const browserTz = useMemo(() => browserTimezone(), []);
  const savedTz = company?.timezone && company.timezone !== "UTC" ? company.timezone : null;
  const savedCurrency = (company?.currency ?? "").toUpperCase();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currency: CURRENCIES.some((c) => c.code === savedCurrency) ? savedCurrency : guessCurrency(browserTz),
      timezone: savedTz ?? (browserTz && zones.includes(browserTz) ? browserTz : "UTC"),
    },
  });

  const handleSubmit = async (values: FormValues) => {
    if (isLoading) return;
    try {
      if (!companyId) {
        toast({ title: "Something went wrong", description: "We could not find your company. Please reload and try again.", variant: "destructive" });
        return;
      }
      setIsLoading(true);
      // Row-level security turns a refused update into "0 rows", not an error: ask for the row back to tell.
      const { data, error } = await supabase
        .from("companies")
        .update({ currency: values.currency, timezone: values.timezone })
        .eq("id", companyId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Only the workspace owner can change these settings.");
      await refreshProfile();
      sonnerToast.success("Settings saved");
      onComplete?.();
    } catch (error) {
      toast({ title: "Could not save the settings", description: (error as { message?: string } | null)?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col animate-in slide-in-from-right-8 duration-500 motion-reduce:animate-none">
      <CardHeader className={isEmbedded ? "px-0 pb-6 pt-0" : "border-b border-border/50 pb-6"}>
        <CardTitle className="font-display text-2xl font-semibold tracking-tight text-foreground">Currency and timezone</CardTitle>
        <CardDescription className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
          Pay is shown in this currency, and attendance follows this timezone.
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex h-full flex-col">
          <CardContent className={`flex-1 space-y-5 ${isEmbedded ? "px-0 pb-4 pt-2" : "pt-6"}`}>
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Choose a currency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72">
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Used on salaries, payslips and expenses.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Choose a timezone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72">
                      {zones.map((z) => (
                        <SelectItem key={z} value={z}>
                          {z.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {browserTz && field.value === browserTz ? "Matches this computer's clock." : "Decides which day a punch or a leave request falls on."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>

          <CardFooter className={isEmbedded ? "px-0 pb-0 pt-2" : "border-t border-border/50 px-8 pb-8 pt-6"}>
            <Button type="submit" size="lg" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden /> Saving…
                </>
              ) : (
                <>
                  Continue <ArrowRight aria-hidden />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </div>
  );
}
