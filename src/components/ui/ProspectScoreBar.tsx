import React, { memo } from 'react';
import { Flame, Thermometer, Snowflake } from 'lucide-react';

interface ProspectScoreBarProps {
  score: number;
  showLabel?: boolean;
  showBand?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-orange-500';
  if (score >= 60) return 'bg-warning';
  return 'bg-blue-400';
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-orange-500';
  if (score >= 60) return 'text-warning';
  return 'text-blue-400';
}

function getBandIcon(score: number) {
  if (score >= 80) return <Flame size={11} className="text-orange-500" />;
  if (score >= 60) return <Thermometer size={11} className="text-amber-500" />;
  return <Snowflake size={11} className="text-blue-400" />;
}

function getBandLabel(score: number): string {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Warm';
  return 'Cold';
}

const ProspectScoreBar = memo(function ProspectScoreBar({ score, showLabel = true, showBand = false }: ProspectScoreBarProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {showLabel && (
        <span className={`font-mono-data text-xs font-semibold w-7 shrink-0 ${getScoreTextColor(score)}`}>
          {score}
        </span>
      )}
      <div className="prospect-score-bar flex-1 min-w-[40px]">
        <div
          className={`h-full rounded-sm transition-all duration-300 ${getScoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {showBand && (
        <span className={`flex items-center gap-0.5 text-[10px] font-medium shrink-0 ${getScoreTextColor(score)}`}>
          {getBandIcon(score)}
          {getBandLabel(score)}
        </span>
      )}
    </div>
  );
});

export default ProspectScoreBar;