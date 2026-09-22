import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatarMoedaBRL, parseMoeda } from "@/lib/format";

export interface InputMoedaProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: string | number | null;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (raw: string, num: number | null) => void;
}

/**
 * Campo de texto especializado em valores monetários brasileiros (BRL).
 * Formato padrão: R$ 000.000.000.000,00
 *
 * Garante que:
 * 1. O valor visual exibido esteja sempre no formato oficial brasileiro com vírgula e prefixo R$.
 * 2. O evento onChange envie o valor no tipo limpo/correto (ex.: "1000000" ou "50.50"),
 *    compatível com banco de dados, APIs e URLs sem erros de sintaxe numérica.
 */
export const InputMoeda = React.forwardRef<HTMLInputElement, InputMoedaProps>(
  ({ value, onChange, onValueChange, placeholder = "R$ 0,00", className, ...props }, ref) => {
    // Estado interno para controle de digitação
    const [inteira, setInteira] = React.useState<string>(() => {
      const num = parseMoeda(value);
      if (num === null) return "";
      const [intPart] = String(num).split(".");
      return intPart || "";
    });

    const [centavos, setCentavos] = React.useState<string>(() => {
      const num = parseMoeda(value);
      if (num === null) return "";
      const [, decPart] = Number(num).toFixed(2).split(".");
      return decPart && decPart !== "00" ? decPart : "";
    });

    const [temVirgula, setTemVirgula] = React.useState<boolean>(() => {
      const num = parseMoeda(value);
      if (num === null) return false;
      return num % 1 !== 0;
    });

    // Sincroniza com alterações externas de `value` (ex.: presets "Acima de R$ 1M" ou "Limpar filtros")
    React.useEffect(() => {
      const num = parseMoeda(value);
      if (num === null) {
        setInteira("");
        setCentavos("");
        setTemVirgula(false);
      } else {
        const [intPart, decPart] = Number(num).toFixed(2).split(".");
        setInteira(intPart || "");
        if (decPart && decPart !== "00") {
          setCentavos(decPart);
          setTemVirgula(true);
        } else {
          setCentavos("");
          setTemVirgula(false);
        }
      }
    }, [value]);

    // Calcula o texto a ser exibido no input
    const displayValue = React.useMemo(() => {
      if (!inteira && !centavos && !temVirgula) return "";
      const numInteiro = inteira ? Number(inteira) : 0;
      const fmtInteira = new Intl.NumberFormat("pt-BR").format(numInteiro);

      if (temVirgula) {
        return `R$ ${fmtInteira},${centavos}`;
      }
      return `R$ ${fmtInteira},00`;
    }, [inteira, centavos, temVirgula]);

    const notificarMudanca = (novaInteira: string, novosCentavos: string, virgulaAtiva: boolean) => {
      if (!novaInteira && !novosCentavos && !virgulaAtiva) {
        if (onChange) {
          const event = {
            target: { value: "", name: props.name || "" },
            currentTarget: { value: "", name: props.name || "" },
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          onChange(event);
        }
        onValueChange?.("", null);
        return;
      }

      const numInt = novaInteira ? Number(novaInteira) : 0;
      let raw = "";
      let num = 0;

      if (virgulaAtiva && novosCentavos) {
        raw = `${novaInteira || "0"}.${novosCentavos.padEnd(2, "0")}`;
        num = Number(raw);
      } else {
        raw = String(numInt);
        num = numInt;
      }

      if (onChange) {
        const event = {
          target: { value: raw, name: props.name || "" },
          currentTarget: { value: raw, name: props.name || "" },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        onChange(event);
      }
      onValueChange?.(raw, num);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        if (temVirgula) {
          if (centavos.length > 0) {
            const novosCents = centavos.slice(0, -1);
            setCentavos(novosCents);
            notificarMudanca(inteira, novosCents, true);
          } else {
            setTemVirgula(false);
            notificarMudanca(inteira, "", false);
          }
        } else {
          const novaInt = inteira.slice(0, -1);
          setInteira(novaInt);
          notificarMudanca(novaInt, "", false);
        }
      } else if (e.key === "," || e.key === ".") {
        e.preventDefault();
        setTemVirgula(true);
        notificarMudanca(inteira, centavos, true);
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (temVirgula) {
          if (centavos.length < 2) {
            const novosCents = centavos + e.key;
            setCentavos(novosCents);
            notificarMudanca(inteira, novosCents, true);
          }
        } else {
          // Limite de 14 dígitos (trilhões)
          if (inteira.length < 14) {
            const novaInt = inteira === "0" ? e.key : inteira + e.key;
            setInteira(novaInt);
            notificarMudanca(novaInt, "", false);
          }
        }
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const texto = e.clipboardData.getData("text");
      const parsed = parseMoeda(texto);
      if (parsed !== null) {
        const [intPart, decPart] = Number(parsed).toFixed(2).split(".");
        setInteira(intPart || "");
        if (decPart && decPart !== "00") {
          setCentavos(decPart);
          setTemVirgula(true);
          notificarMudanca(intPart, decPart, true);
        } else {
          setCentavos("");
          setTemVirgula(false);
          notificarMudanca(intPart, "", false);
        }
      }
    };

    // Caso o usuário selecione e corte (Cut) ou limpe
    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
      const val = (e.target as HTMLInputElement).value;
      if (!val || val.trim() === "") {
        setInteira("");
        setCentavos("");
        setTemVirgula(false);
        notificarMudanca("", "", false);
      }
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={displayValue}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onInput={handleInput}
        onChange={() => {}} // controlado via keydown/paste/input
        className={className}
      />
    );
  },
);

InputMoeda.displayName = "InputMoeda";
