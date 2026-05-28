import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Mail,
  Globe,
  Code,
  Braces,
  Archive,
  Image,
  File,
  FileCode,
} from "lucide-react";

const MIME_ICON_MAP: Record<string, LucideIcon> = {
  "application/pdf": FileText,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileText,
  "application/msword": FileText,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": FileSpreadsheet,
  "application/vnd.ms-excel": FileSpreadsheet,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": Presentation,
  "application/vnd.ms-powerpoint": Presentation,
  "message/rfc822": Mail,
  "application/vnd.ms-outlook": Mail,
  "text/html": Globe,
  "application/xhtml+xml": Globe,
  "application/xml": Code,
  "text/xml": Code,
  "application/json": Braces,
  "text/yaml": FileCode,
  "application/yaml": FileCode,
  "application/x-yaml": FileCode,
  "application/zip": Archive,
  "application/x-tar": Archive,
  "application/gzip": Archive,
  "application/x-7z-compressed": Archive,
  "application/x-rar-compressed": Archive,
  "image/png": Image,
  "image/jpeg": Image,
  "image/tiff": Image,
  "image/heic": Image,
  "image/webp": Image,
  "image/gif": Image,
  "text/plain": FileText,
  "text/markdown": FileText,
  "text/csv": FileSpreadsheet,
};

const EXT_ICON_MAP: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  ppt: Presentation,
  pptx: Presentation,
  eml: Mail,
  msg: Mail,
  html: Globe,
  htm: Globe,
  xml: Code,
  json: Braces,
  yaml: FileCode,
  yml: FileCode,
  zip: Archive,
  tar: Archive,
  gz: Archive,
  "7z": Archive,
  rar: Archive,
  png: Image,
  jpg: Image,
  jpeg: Image,
  tif: Image,
  tiff: Image,
  heic: Image,
  webp: Image,
  gif: Image,
  txt: FileText,
  md: FileText,
  csv: FileSpreadsheet,
};

interface DocFormatIconProps {
  mimeType?: string | null;
  fileName?: string | null;
  size?: number;
  color?: string;
  className?: string;
}

export default function DocFormatIcon({ mimeType, fileName, size = 16, color, className }: DocFormatIconProps) {
  let IconComponent: LucideIcon | undefined;

  if (mimeType && MIME_ICON_MAP[mimeType]) {
    IconComponent = MIME_ICON_MAP[mimeType];
  }

  if (!IconComponent && fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && EXT_ICON_MAP[ext]) {
      IconComponent = EXT_ICON_MAP[ext];
    }
  }

  if (!IconComponent) {
    IconComponent = File;
  }

  return <IconComponent size={size} color={color} className={className} />;
}

export { MIME_ICON_MAP, EXT_ICON_MAP };
