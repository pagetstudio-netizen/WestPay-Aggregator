import { toast } from "@/hooks/use-toast";
import { translateForCurrentLanguage } from "@/lib/language";

type CopyOptions = {
  successTitle?: string;
  successDescription?: string;
};

function fallbackCopy(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy_failed");
}

export async function copyTextToClipboard(text: string, options: CopyOptions = {}): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }

    if (options.successTitle) {
      toast({
        title: options.successTitle,
        description: options.successDescription,
        variant: "success",
      });
    }
  } catch (error) {
    toast({
      title: translateForCurrentLanguage("copyFailed"),
      description: translateForCurrentLanguage("copyFailedDesc"),
      variant: "destructive",
    });
    throw error;
  }
}