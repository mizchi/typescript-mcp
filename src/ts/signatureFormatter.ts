import type {
  Definition,
  TypeSignature,
} from "./navigations/getTypeSignature.ts";
import { relative } from "path";

export interface FormatTypeSignatureInput {
  message: string;
  signature: TypeSignature;
  documentation?: string;
  relatedTypes?: Definition[];
  root: string;
}

export function formatTypeSignature(input: FormatTypeSignatureInput): string {
  const { message, signature, documentation, relatedTypes, root } = input;
  const output: string[] = [];

  // Header
  output.push(message);
  output.push("");

  // Add definitions if available
  if (signature.definitions && signature.definitions.length > 0) {
    output.push("📍 Definitions:");
    for (const def of signature.definitions) {
      const relativePath = relative(root, def.filePath);
      let defStr = `  ${def.kind}: ${relativePath}:${def.line}:${def.column}`;

      // Add name information
      if (def.name) {
        defStr += ` (${def.name})`;
      }
      if (def.kind === "Alias" && def.originalName) {
        defStr += ` → ${def.originalName}`;
      }

      output.push(defStr);
    }
    output.push("");
  }

  // Add related types if available
  if (relatedTypes && relatedTypes.length > 0) {
    output.push("🔗 Related Types:");
    for (const relType of relatedTypes) {
      const relativePath = relative(root, relType.filePath);
      let relStr =
        `  ${relType.kind}: ${relativePath}:${relType.line}:${relType.column}`;

      if (relType.name) {
        relStr += ` (${relType.name})`;
      }
      if (relType.importedFrom) {
        relStr += ` from "${relType.importedFrom}"`;
      }

      output.push(relStr);
    }
    output.push("");
  }

  // Add documentation if available
  if (documentation) {
    output.push("📖 Documentation:");
    output.push(documentation);
    output.push("");
  }

  // Format based on the kind of type
  if (signature.kind === "function" && signature.functionSignatures) {
    output.push("📝 Function Signatures:");
    for (let i = 0; i < signature.functionSignatures.length; i++) {
      const sig = signature.functionSignatures[i];

      if (signature.functionSignatures.length > 1) {
        output.push(`\nOverload ${i + 1}:`);
      }

      // Format as TypeScript function signature
      let signatureStr = "  ";

      // Add type parameters if present
      if (sig.typeParameters && sig.typeParameters.length > 0) {
        signatureStr += `<${sig.typeParameters.join(", ")}>(`;
      } else {
        signatureStr += "(";
      }

      // Add parameters
      const paramStrs = sig.parameters.map((param) => {
        let paramStr = param.name;
        if (param.optional && !param.defaultValue) {
          paramStr += "?";
        }
        paramStr += ": " + param.type;
        if (param.defaultValue) {
          paramStr += " = " + param.defaultValue;
        }
        return paramStr;
      });

      signatureStr += paramStrs.join(", ");
      signatureStr += "): " + sig.returnType;

      output.push(signatureStr);
    }
  } else if (signature.kind === "type" && signature.typeDefinition) {
    output.push(`📋 Type Definition:`);
    if (signature.typeParameters && signature.typeParameters.length > 0) {
      output.push(
        `  Type Parameters: <${signature.typeParameters.join(", ")}>`,
      );
    }
    output.push(`  Type: ${signature.typeDefinition}`);
  } else if (
    (signature.kind === "interface" || signature.kind === "class") &&
    (signature.properties || signature.methods)
  ) {
    output.push(
      `${
        signature.kind === "interface" ? "📐 Interface" : "🏗️ Class"
      } Definition:`,
    );

    if (signature.typeParameters && signature.typeParameters.length > 0) {
      output.push(
        `  Type Parameters: <${signature.typeParameters.join(", ")}>`,
      );
    }

    if (signature.properties && signature.properties.length > 0) {
      output.push("\n  Properties:");
      for (const prop of signature.properties) {
        output.push(
          `    ${prop.name}${prop.optional ? "?" : ""}: ${prop.type}`,
        );
      }
    }

    if (signature.methods && signature.methods.length > 0) {
      output.push("\n  Methods:");
      for (const method of signature.methods) {
        for (const sig of method.signatures) {
          const typeParamStr =
            sig.typeParameters && sig.typeParameters.length > 0
              ? `<${sig.typeParameters.join(", ")}>`
              : "";

          const paramStrs = sig.parameters.map((p) => {
            let paramStr = p.name;
            if (p.optional && !p.defaultValue) {
              paramStr += "?";
            }
            paramStr += ": " + p.type;
            if (p.defaultValue) {
              paramStr += " = " + p.defaultValue;
            }
            return paramStr;
          });

          const signatureStr = `    ${method.name}${typeParamStr}(${
            paramStrs.join(", ")
          }): ${sig.returnType}`;
          output.push(signatureStr);
        }
      }
    }
  } else if (signature.kind === "variable" && signature.typeDefinition) {
    output.push(`📦 Variable Type:`);
    output.push(`  Type: ${signature.typeDefinition}`);
  }

  return output.join("\n");
}
