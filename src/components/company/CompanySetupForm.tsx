import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Building, Upload, ArrowRight, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { toast as sonnerToast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  name: z.string().min(1, { message: "Company name is required" }),
  phone: z.string().optional(),
  website: z.string().refine((val) => {
    if (!val) return true;
    return /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(val);
  }, { message: "Please enter a valid website URL" }).optional().or(z.literal('')),
  address: z.string().optional(),
  company_size: z.string().optional(),
  company_type: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface CompanySetupFormProps { 
  isOpen?: boolean; 
  onComplete?: () => void;
  isEmbedded?: boolean;
}

export default function CompanySetupForm({ onComplete, isEmbedded = false }: CompanySetupFormProps) {
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", phone: "", website: "", address: "", company_size: "", company_type: "" } });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]; setLogoFile(file);
      const reader = new FileReader(); reader.onload = () => setLogoPreview(reader.result as string); reader.readAsDataURL(file);
    }
  };
  
  const handleSubmit = async (values: FormValues) => {
    try {
      if (!user) { toast({ title: "Authentication required", description: "Please log in.", variant: "destructive" }); return; }
      setIsLoading(true);
      let logoUrl = null;
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const filePath = `${user.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, logoFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(filePath);
        logoUrl = publicUrl;
      }
      const formattedWebsite = values.website ? (values.website.startsWith('http') ? values.website : `https://${values.website}`) : null;
      
      const { data: companyData, error: companyError } = await supabase.from('companies').insert({ 
        name: values.name, 
        phone: values.phone || null, 
        website: formattedWebsite, 
        address: values.address || null, 
        company_size: values.company_size || null, 
        company_type: values.company_type || null, 
        logo: logoUrl 
      }).select('*').single();
      if (companyError) throw companyError;
      const { error: profileError } = await supabase.from('profiles').update({ company_id: companyData.id, is_admin: true }).eq('id', user.id);
      if (profileError) throw profileError;
      await refreshProfile();
      sonnerToast.success("Company setup complete", { description: "Your company has been successfully configured." });
      if (onComplete) onComplete();
    } catch (error: any) {
      console.error("Error setting up company:", error);
      toast({ title: "Failed to setup company", description: error.message || "Please try again.", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  const formContent = (
    <>
      <CardHeader className={`${isEmbedded ? 'px-0 pt-0 pb-6' : 'pb-6 border-b border-border/50 bg-muted/10'} relative z-10`}>
        <CardTitle className="flex items-center text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {!isEmbedded && (
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mr-3 border border-primary/20">
              <Building className="h-5 w-5 text-primary" />
            </div>
          )}
          Company Profile
        </CardTitle>
        <CardDescription className="text-base sm:text-lg mt-2 text-muted-foreground">
          Provide your organization's details to initialize your workspace.
        </CardDescription>
      </CardHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="relative z-10 flex flex-col h-full">
          <CardContent className={`space-y-4 sm:space-y-5 flex-1 ${isEmbedded ? 'px-0 pt-2 pb-4' : 'pt-6'}`}>
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  Company Name <span className="text-primary">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. Nexus Orbits Pakistan" className="h-10 sm:h-11 bg-background/50 border-border/60 hover:border-border focus:border-primary focus:ring-primary/20 transition-all rounded-xl shadow-sm text-base" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-foreground">Phone Number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. +923244965220" className="h-10 sm:h-11 bg-background/50 border-border/60 hover:border-border focus:border-primary focus:ring-primary/20 transition-all rounded-xl shadow-sm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="website" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-foreground">Website</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. NexusOrbits.pk" className="h-10 sm:h-11 bg-background/50 border-border/60 hover:border-border focus:border-primary focus:ring-primary/20 transition-all rounded-xl shadow-sm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-foreground">Office Address</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. 227/A Circular road Lahore" className="h-10 sm:h-11 bg-background/50 border-border/60 hover:border-border focus:border-primary focus:ring-primary/20 transition-all rounded-xl shadow-sm" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <FormField control={form.control} name="company_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-foreground">Industry Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 sm:h-11 bg-background/50 border-border/60 hover:border-border focus:ring-primary/20 rounded-xl shadow-sm">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="technology">Technology & IT</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="retail">Retail & E-commerce</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="finance">Finance & Banking</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="company_size" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-foreground">Company Size</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 sm:h-11 bg-background/50 border-border/60 hover:border-border focus:ring-primary/20 rounded-xl shadow-sm">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 employees</SelectItem>
                      <SelectItem value="11-50">11-50 employees</SelectItem>
                      <SelectItem value="51-200">51-200 employees</SelectItem>
                      <SelectItem value="201-500">201-500 employees</SelectItem>
                      <SelectItem value="500+">500+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            
            <div className="space-y-2 pt-1">
              <Label className="text-sm font-semibold text-foreground">Brand Logo</Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3.5 rounded-2xl border border-dashed border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors">
                {logoPreview ? (
                  <div className="relative w-16 h-16 rounded-xl bg-white dark:bg-black border border-border shadow-sm overflow-hidden group/img shrink-0">
                    <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain p-1.5" />
                    <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm">
                      <span className="text-[10px] font-semibold tracking-wider uppercase">Remove</span>
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-background border border-border shadow-sm text-muted-foreground shrink-0">
                    <Building className="h-6 w-6 opacity-40" />
                  </div>
                )}
                <div className="flex-1 w-full sm:w-auto">
                  <label htmlFor="logo-upload" className="inline-flex w-full sm:w-auto items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer shadow-sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Image
                  </label>
                  <input id="logo-upload" type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Recommended: PNG, JPG, or SVG. Max 2MB.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
          
          <CardFooter className={`${isEmbedded ? 'px-0 pt-2 pb-0' : 'pt-6 pb-8 px-8 border-t border-border/50 bg-muted/5'}`}>
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full relative overflow-hidden h-14 rounded-xl text-lg font-bold shadow-[0_8px_30px_rgb(var(--primary)_/_0.2)] hover:shadow-[0_8px_30px_rgb(var(--primary)_/_0.3)] transition-all group"
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Finalizing Setup...</>
              ) : (
                <span className="relative z-10 flex items-center justify-center w-full">
                  Continue to Next Step 
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
              {/* Premium button shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[loader-progress-slide_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            </Button>
          </CardFooter>
        </form>
      </Form>
    </>
  );

  if (isEmbedded) {
    return <div className="h-full flex flex-col w-full">{formContent}</div>;
  }
  
  return (
    <Card className="glass-card shadow-2xl border-primary/10 overflow-hidden relative group rounded-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      {formContent}
    </Card>
  );
}
