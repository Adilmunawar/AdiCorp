import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Building, Upload, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { toast as sonnerToast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** "example.com" or "https://example.com/careers" → a URL, or null when it is not one. */
function normaliseWebsite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

const formSchema = z.object({
  // Same limits as create_company_for_current_user (2 to 120 characters after trimming).
  name: z
    .string()
    .trim()
    .min(1, { message: "Enter your company name" })
    .min(2, { message: "The name needs at least 2 characters" })
    .max(120, { message: "The name can be at most 120 characters" }),
  phone: z.string().trim().max(32, { message: "That phone number is too long" }).optional(),
  website: z
    .string()
    .trim()
    .refine((val) => !val || normaliseWebsite(val) !== null, { message: "Enter a website like example.com" })
    .optional(),
  address: z.string().trim().max(300, { message: "The address can be at most 300 characters" }).optional(),
  company_size: z.string().optional(),
  company_type: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface CompanySetupFormProps {
  onComplete?: () => void;
  isEmbedded?: boolean;
}

const INDUSTRIES = [
  ["technology", "Technology and IT"],
  ["manufacturing", "Manufacturing"],
  ["retail", "Retail and e-commerce"],
  ["healthcare", "Healthcare"],
  ["finance", "Finance and banking"],
  ["education", "Education"],
  ["services", "Professional services"],
  ["logistics", "Logistics and transport"],
  ["hospitality", "Hospitality"],
  ["nonprofit", "Non-profit"],
  ["other", "Other"],
] as const;

const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

/** Onboarding step 1: creates the company and makes the signed-in person its owner. */
export default function CompanySetupForm({ onComplete, isEmbedded = false }: CompanySetupFormProps) {
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", phone: "", website: "", address: "", company_size: "", company_type: "" },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // The file is kept in state; clearing the input lets the same file be picked again after "Remove".
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      sonnerToast.error("Use a PNG, JPG or WebP logo up to 2 MB");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (values: FormValues) => {
    if (isLoading) return;
    try {
      if (!user) {
        toast({ title: "Please sign in first", variant: "destructive" });
        return;
      }
      setIsLoading(true);
      let logoUrl: string | null = null;
      if (logoFile) {
        const ext = logoFile.type === "image/png" ? "png" : logoFile.type === "image/webp" ? "webp" : "jpg";
        // Logos are public: the file name must not reveal who uploaded it.
        const filePath = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("logos").upload(filePath, logoFile, { contentType: logoFile.type });
        if (uploadError) throw uploadError;
        logoUrl = supabase.storage.from("logos").getPublicUrl(filePath).data.publicUrl;
      }

      // The server creates the company and makes the caller its owner in one transaction.
      const { error } = await supabase.rpc("create_company_for_current_user", {
        p_name: values.name,
        p_phone: values.phone || undefined,
        p_website: values.website ? normaliseWebsite(values.website) ?? undefined : undefined,
        p_address: values.address || undefined,
        p_company_size: values.company_size || undefined,
        p_company_type: values.company_type || undefined,
        p_logo: logoUrl ?? undefined,
      });
      if (error) throw error;
      await refreshProfile();
      sonnerToast.success(`${values.name} is set up`);
      onComplete?.();
    } catch (error) {
      toast({
        title: "Could not create the company",
        description: (error as { message?: string } | null)?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const field = "h-11";

  const formContent = (
    <>
      <CardHeader className={isEmbedded ? "px-0 pb-6 pt-0" : "border-b border-border/50 pb-6"}>
        <CardTitle className="font-display text-2xl font-semibold tracking-tight text-foreground">Tell us about your company</CardTitle>
        <CardDescription className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
          This appears on payslips, letters and your careers page. Only the name is required.
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex h-full flex-col">
          <CardContent className={`flex-1 space-y-5 ${isEmbedded ? "px-0 pb-4 pt-2" : "pt-6"}`}>
            <FormField
              control={form.control}
              name="name"
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>
                    Company name <span aria-hidden className="text-danger">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...f} autoFocus autoComplete="organization" placeholder="e.g. Acme Ltd" className={field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...f} type="tel" autoComplete="tel" placeholder="+1 555 010 0000" className={field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input {...f} inputMode="url" autoComplete="url" placeholder="example.com" className={field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>Office address</FormLabel>
                  <FormControl>
                    <Input {...f} autoComplete="street-address" placeholder="Street, city, country" className={field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="company_type"
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Industry</FormLabel>
                    <Select onValueChange={f.onChange} value={f.value}>
                      <FormControl>
                        <SelectTrigger className={field}>
                          <SelectValue placeholder="Choose an industry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INDUSTRIES.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company_size"
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel>Company size</FormLabel>
                    <Select onValueChange={f.onChange} value={f.value}>
                      <FormControl>
                        <SelectTrigger className={field}>
                          <SelectValue placeholder="How many people" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SIZES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s} employees
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2 pt-1">
              <Label>Logo</Label>
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border bg-muted/20 p-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center">
                {logoPreview ? (
                  <div className="group/img relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:bg-black">
                    <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain p-1.5" />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                      }}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-semibold uppercase tracking-wider text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover/img:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-sm">
                    <Building className="h-6 w-6 opacity-40" aria-hidden />
                  </div>
                )}
                <div className="w-full flex-1 sm:w-auto">
                  <Button asChild variant="outline" size="sm" className="cursor-pointer">
                    <label htmlFor="logo-upload">
                      <Upload aria-hidden />
                      Upload a logo
                    </label>
                  </Button>
                  <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} className="sr-only" />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">PNG, JPG or WebP, up to 2 MB. You can add it later.</p>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className={isEmbedded ? "px-0 pb-0 pt-2" : "border-t border-border/50 px-8 pb-8 pt-6"}>
            <Button type="submit" size="lg" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden /> Creating your workspace…
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
    </>
  );

  if (isEmbedded) return <div className="flex h-full w-full flex-col">{formContent}</div>;
  return <Card className="overflow-hidden rounded-2xl border-border shadow-sm">{formContent}</Card>;
}
