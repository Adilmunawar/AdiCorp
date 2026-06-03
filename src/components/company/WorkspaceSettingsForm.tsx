import { useState } from "react";
import { CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Settings2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { toast as sonnerToast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const formSchema = z.object({
  currency: z.string().min(1, { message: "Base currency is required" }),
});
type FormValues = z.infer<typeof formSchema>;

interface WorkspaceSettingsFormProps { 
  onComplete?: () => void;
  isEmbedded?: boolean;
}

export default function WorkspaceSettingsForm({ onComplete, isEmbedded = false }: WorkspaceSettingsFormProps) {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  const form = useForm<FormValues>({ 
    resolver: zodResolver(formSchema), 
    defaultValues: { 
      currency: "PKR", 
    } 
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      if (!userProfile?.company_id) {
        toast({ title: "Error", description: "Company ID not found. Please restart onboarding.", variant: "destructive" }); 
        return;
      }
      
      setIsLoading(true);

      // Update companies table with currency
      const { error: companyError } = await supabase
        .from('companies')
        .update({ currency: values.currency })
        .eq('id', userProfile.company_id);
        
      if (companyError) throw companyError;

      sonnerToast.success("Workspace settings saved", { description: "Your core preferences have been stored." });
      
      if (onComplete) onComplete();
    } catch (error: any) {
      console.error("Error saving workspace settings:", error);
      toast({ title: "Failed to save settings", description: error.message || "Please try again.", variant: "destructive" });
    } finally { 
      setIsLoading(false); 
    }
  };

  const formContent = (
    <>
      <CardHeader className={`${isEmbedded ? 'px-0 pt-0 pb-6' : 'pb-6 border-b border-border/50 bg-muted/10'} relative z-10`}>
        <CardTitle className="flex items-center text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {!isEmbedded && (
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mr-3 border border-primary/20">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
          )}
          Workspace Settings
        </CardTitle>
        <CardDescription className="text-base sm:text-lg mt-2 text-muted-foreground">
          Configure default behavior for your HR ecosystem.
        </CardDescription>
      </CardHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="relative z-10 flex flex-col h-full">
          <CardContent className={`space-y-6 flex-1 ${isEmbedded ? 'px-0 pt-2 pb-4' : 'pt-6'}`}>
            
            <div className="grid grid-cols-1 gap-4 sm:gap-5">
              <FormField control={form.control} name="currency" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-foreground">Base Currency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 sm:h-11 bg-background/50 border-border/60 hover:border-border focus:ring-primary/20 rounded-xl shadow-sm">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PKR">Pakistani Rupee (PKR)</SelectItem>
                      <SelectItem value="USD">US Dollar (USD)</SelectItem>
                      <SelectItem value="EUR">Euro (EUR)</SelectItem>
                      <SelectItem value="GBP">British Pound (GBP)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

          </CardContent>
          
          <CardFooter className={`${isEmbedded ? 'px-0 pt-2 pb-0' : 'pt-6 pb-8 px-8 border-t border-border/50 bg-muted/5'}`}>
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full relative overflow-hidden h-14 rounded-xl text-lg font-bold shadow-[0_8px_30px_rgb(var(--primary)_/_0.2)] hover:shadow-[0_8px_30px_rgb(var(--primary)_/_0.3)] transition-all group"
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Saving Settings...</>
              ) : (
                <span className="relative z-10 flex items-center justify-center w-full">
                  Continue to Next Step
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[loader-progress-slide_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            </Button>
          </CardFooter>
        </form>
      </Form>
    </>
  );

  return <div className="h-full flex flex-col w-full animate-in slide-in-from-right-8 duration-500">{formContent}</div>;
}
