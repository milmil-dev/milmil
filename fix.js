const fs = require('fs');
const content = fs.readFileSync('web/src/pages/LibraryDetailPage.tsx', 'utf8');
let newContent = content.replace(
  "const columns: ColumnDef<MediaFileEntry>[] = [",
  "const columns = React.useMemo<ColumnDef<MediaFileEntry>[]>(() => ["
);
newContent = newContent.replace(
  "  ];\n\n  const table = useReactTable({",
  "  ], [i18n, onMatch]);\n\n  const table = useReactTable({"
);
newContent = newContent.replace(
  "import { useEffect, useState } from 'react';",
  "import React, { useEffect, useState } from 'react';"
);
fs.writeFileSync('web/src/pages/LibraryDetailPage.tsx', newContent);
