'use client';

import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import PipelineWidgets from '../_shared/PipelineWidgets';
import { LIGHT_VARS, DARK_VARS } from '../_theme';

// Renders the real pipeline stage badges/score bars/regulation badges against sanitized
// fixture data so marketing screenshots stay pixel-accurate to the live product.
export default function PipelinePreviewPage() {
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? 'dark' : ''} style={dark ? DARK_VARS : LIGHT_VARS}>
      <div className="min-h-screen bg-background p-6 sm:p-8 transition-colors">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Pipeline</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Sample data for illustration purposes only</p>
            </div>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              {dark ? <Sun size={13} /> : <Moon size={13} />}
              {dark ? 'Light mode' : 'Dark mode'}
            </button>
          </div>

          <PipelineWidgets />
        </div>
      </div>
    </div>
  );
}


