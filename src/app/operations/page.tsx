'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Wrench, Calendar, AlertTriangle, Package, CheckCircle, Camera, Plus, Zap, Droplets, Wind, Settings, AlertCircle, RotateCcw, Eye } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';



interface CleaningJob {
  id: string;
  property: string;
  date: string;
  timeWindow: string;
  cleaner: string;
  type: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Verified' | 'Needs Redo';
  beforePhotos: number;
  afterPhotos: number;
}

interface MaintenanceRequest {
  id: string;
  property: string;
  title: string;
  category: string;
  priority: 'Low' | 'Medium' | 'High' | 'Emergency';
  status: 'Submitted' | 'Assigned' | 'In Progress' | 'Completed' | 'Verified';
  submittedAt: string;
}

interface InventoryAlert {
  id: string;
  property: string;
  item: string;
  status: 'Low' | 'Out';
}

const mockCleanings: CleaningJob[] = [
  { id: '1', property: '1842 Larimer St, Denver', date: 'Today', timeWindow: '10:00 AM – 12:00 PM', cleaner: 'Maria G.', type: 'Turnover', status: 'In Progress', beforePhotos: 4, afterPhotos: 0 },
  { id: '2', property: '3301 Zuni St, Denver', date: 'Tomorrow', timeWindow: '9:00 AM – 11:00 AM', cleaner: 'Carlos R.', type: 'Turnover', status: 'Scheduled', beforePhotos: 0, afterPhotos: 0 },
  { id: '3', property: '2450 W 26th Ave, Denver', date: 'Aug 15', timeWindow: '1:00 PM – 4:00 PM', cleaner: 'Lisa T.', type: 'Deep Clean', status: 'Scheduled', beforePhotos: 0, afterPhotos: 0 },
  { id: '4', property: '1560 Blake St, Denver', date: 'Yesterday', timeWindow: '10:00 AM – 12:00 PM', cleaner: 'Maria G.', type: 'Turnover', status: 'Needs Redo', beforePhotos: 3, afterPhotos: 2 },
];

const mockMaintenance: MaintenanceRequest[] = [
  { id: '1', property: '1842 Larimer St, Denver', title: 'Leaky faucet in master bath', category: 'Plumbing', priority: 'High', status: 'Submitted', submittedAt: '2026-08-12' },
  { id: '2', property: '3301 Zuni St, Denver', title: 'AC filter replacement', category: 'HVAC', priority: 'Medium', status: 'In Progress', submittedAt: '2026-08-10' },
  { id: '3', property: '2450 W 26th Ave, Denver', title: 'Broken patio door lock', category: 'General', priority: 'High', status: 'Assigned', submittedAt: '2026-08-11' },
];

const mockInventoryAlerts: InventoryAlert[] = [
  { id: '1', property: '1842 Larimer St', item: 'Toilet Paper (12-pack)', status: 'Low' },
  { id: '2', property: '1842 Larimer St', item: 'Trash Bags', status: 'Out' },
  { id: '3', property: '3301 Zuni St', item: 'Coffee Pods', status: 'Low' },
];

const cleaningStatusConfig = {
  'Scheduled': { color: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  'In Progress': { color: 'bg-warning-bg text-warning border border-warning-border', dot: 'bg-warning' },
  'Completed': { color: 'bg-success-bg text-success border border-success-border', dot: 'bg-success' },
  'Verified': { color: 'bg-primary/10 text-primary border border-primary/20', dot: 'bg-primary' },
  'Needs Redo': { color: 'bg-danger-bg text-danger border border-danger-border', dot: 'bg-danger' },
};

const priorityConfig = {
  'Low': 'bg-muted text-muted-foreground',
  'Medium': 'bg-warning-bg text-warning border border-warning-border',
  'High': 'bg-danger-bg text-danger border border-danger-border',
  'Emergency': 'bg-danger text-white',
};

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cleanings' | 'maintenance' | 'inventory'>('dashboard');

  const needsAttention = mockCleanings.filter(c => c.status === 'Needs Redo').length;
  const pendingVerification = mockCleanings.filter(c => c.status === 'Completed').length;
  const openMaintenance = mockMaintenance.filter(c => c.status !== 'Verified').length;
  const lowInventory = mockInventoryAlerts.length;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Property Operations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage cleanings, maintenance, and inventory across all properties</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all">
              <Plus size={14} />
              Schedule Cleaning
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-all">
              <AlertCircle size={14} />
              New Request
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {(['dashboard', 'cleanings', 'maintenance', 'inventory'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize ${
                activeTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Today's Cleanings", value: mockCleanings.filter(c => c.date === 'Today').length, icon: Calendar, color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Needs Attention', value: needsAttention, icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger-bg' },
                { label: 'Open Maintenance', value: openMaintenance, icon: Wrench, color: 'text-warning', bg: 'bg-warning-bg' },
                { label: 'Low Inventory', value: lowInventory, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                      <Icon size={15} className={color} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                </div>
              ))}
            </div>

            {/* Needs Attention */}
            {needsAttention > 0 && (
              <div className="bg-danger-bg border border-danger-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-danger" />
                  <h3 className="text-sm font-semibold text-danger">Needs Attention</h3>
                </div>
                <div className="space-y-2">
                  {mockCleanings.filter(c => c.status === 'Needs Redo').map(job => (
                    <div key={job.id} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{job.property}</p>
                        <p className="text-xs text-muted-foreground">{job.type} · {job.date} · {job.cleaner}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${cleaningStatusConfig['Needs Redo'].color}`}>
                        Needs Redo
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Cleanings */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Upcoming Cleanings</h3>
                  <button onClick={() => setActiveTab('cleanings')} className="text-xs text-primary hover:underline">View all</button>
                </div>
                <div className="divide-y divide-border">
                  {mockCleanings.slice(0, 3).map(job => {
                    const cfg = cleaningStatusConfig[job.status];
                    return (
                      <div key={job.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{job.property}</p>
                          <p className="text-xs text-muted-foreground">{job.date} · {job.timeWindow} · {job.cleaner}</p>
                        </div>
                        <span className={`ml-3 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                          {job.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Open Maintenance */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Open Maintenance</h3>
                  <button onClick={() => setActiveTab('maintenance')} className="text-xs text-primary hover:underline">View all</button>
                </div>
                <div className="divide-y divide-border">
                  {mockMaintenance.map(req => (
                    <div key={req.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{req.title}</p>
                        <p className="text-xs text-muted-foreground">{req.property} · {req.category}</p>
                      </div>
                      <span className={`ml-3 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${priorityConfig[req.priority]}`}>
                        {req.priority}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Inventory Alerts */}
            {mockInventoryAlerts.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Low Inventory Alerts</h3>
                  <button onClick={() => setActiveTab('inventory')} className="text-xs text-primary hover:underline">Manage inventory</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
                  {mockInventoryAlerts.map(alert => (
                    <div key={alert.id} className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${alert.status === 'Out' ? 'bg-danger' : 'bg-warning'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{alert.item}</p>
                        <p className="text-xs text-muted-foreground">{alert.property}</p>
                      </div>
                      <span className={`ml-auto shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                        alert.status === 'Out' ? 'bg-danger-bg text-danger border border-danger-border' : 'bg-warning-bg text-warning border border-warning-border'
                      }`}>
                        {alert.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'cleanings' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">All Cleaning Jobs</h3>
                <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <Plus size={12} />
                  Schedule New
                </button>
              </div>
              <div className="divide-y divide-border">
                {mockCleanings.map(job => {
                  const cfg = cleaningStatusConfig[job.status];
                  return (
                    <div key={job.id} className="px-4 py-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-foreground">{job.property}</p>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{job.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Calendar size={11} />{job.date} · {job.timeWindow}</span>
                            <span>{job.type}</span>
                            <span>Cleaner: {job.cleaner}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={`flex items-center gap-1 text-xs ${job.beforePhotos > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                              <Camera size={11} />
                              Before: {job.beforePhotos} photos
                            </span>
                            <span className={`flex items-center gap-1 text-xs ${job.afterPhotos > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                              <Camera size={11} />
                              After: {job.afterPhotos} photos
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {job.status === 'Completed' && (
                            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-success text-white rounded-lg hover:bg-success/90 transition-all">
                              <CheckCircle size={12} />
                              Verify
                            </button>
                          )}
                          {job.status === 'Needs Redo' && (
                            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-warning text-white rounded-lg hover:bg-warning/90 transition-all">
                              <RotateCcw size={12} />
                              Request Redo
                            </button>
                          )}
                          <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Maintenance Requests</h3>
                <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <Plus size={12} />
                  New Request
                </button>
              </div>
              <div className="divide-y divide-border">
                {mockMaintenance.map(req => {
                  const categoryIcons: Record<string, any> = {
                    Plumbing: Droplets, HVAC: Wind, Electrical: Zap, General: Settings, Emergency: AlertTriangle, Appliance: Settings
                  };
                  const CatIcon = categoryIcons[req.category] || Settings;
                  return (
                    <div key={req.id} className="px-4 py-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                            <CatIcon size={15} className="text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{req.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{req.property} · {req.category} · Submitted {req.submittedAt}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityConfig[req.priority]}`}>
                            {req.priority}
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {req.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Inventory by Property</h3>
                <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <Plus size={12} />
                  Add Item
                </button>
              </div>
              <div className="divide-y divide-border">
                {[
                  { item: 'Toilet Paper (12-pack)', category: 'Bathroom', property: '1842 Larimer St', status: 'Low', lastRestocked: '2026-08-01' },
                  { item: 'Paper Towels', category: 'Kitchen', property: '1842 Larimer St', status: 'Good', lastRestocked: '2026-08-05' },
                  { item: 'Trash Bags', category: 'General', property: '1842 Larimer St', status: 'Out', lastRestocked: '2026-07-20' },
                  { item: 'Coffee Pods (24-pack)', category: 'Kitchen', property: '3301 Zuni St', status: 'Low', lastRestocked: '2026-08-03' },
                  { item: 'Hand Soap', category: 'Bathroom', property: '3301 Zuni St', status: 'Good', lastRestocked: '2026-08-07' },
                  { item: 'Dish Soap', category: 'Kitchen', property: '2450 W 26th Ave', status: 'Good', lastRestocked: '2026-08-06' },
                ].map((item, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Package size={15} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.item}</p>
                        <p className="text-xs text-muted-foreground">{item.property} · {item.category} · Restocked {item.lastRestocked}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        item.status === 'Out' ? 'bg-danger-bg text-danger border border-danger-border' :
                        item.status === 'Low'? 'bg-warning-bg text-warning border border-warning-border' : 'bg-success-bg text-success border border-success-border'
                      }`}>
                        {item.status}
                      </span>
                      <button className="text-xs text-primary hover:underline">Restock</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
