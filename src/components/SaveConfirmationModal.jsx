import React from 'react';
import { CheckCircle2, X, ArrowRight, ShieldCheck, Tag, Calendar, Scale, Layers } from 'lucide-react';

export default function SaveConfirmationModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-sm sm:max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scaleUp">
        
        {/* Success Icon & Header */}
        <div className="text-center space-y-1.5">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner border-2 border-emerald-200">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-wide uppercase pt-1">
            Entry Saved Successfully
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            {data.moduleName || 'Factory Inventory Record'}
          </p>
        </div>

        {/* Record Details Card */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5 text-xs">
          
          {/* Entry ID */}
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-slate-500 font-bold uppercase text-[11px] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-brand-700" />
              <span>Entry ID</span>
            </span>
            <span className="font-mono font-black text-brand-900 text-sm bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
              {data.entryId}
            </span>
          </div>

          {/* Date */}
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-slate-500 font-bold uppercase text-[11px] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-600" />
              <span>Date</span>
            </span>
            <span className="font-bold text-slate-800">
              {data.date}
            </span>
          </div>

          {/* Product Name */}
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-slate-500 font-bold uppercase text-[11px] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-600" />
              <span>Product</span>
            </span>
            <span className="font-extrabold text-slate-900 text-sm">
              {data.productName}
            </span>
          </div>

          {/* Batch ID */}
          {data.batchId && (
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="text-slate-500 font-bold uppercase text-[11px]">
                Batch ID
              </span>
              <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {data.batchId}
              </span>
            </div>
          )}

          {/* Quantity */}
          <div className="flex justify-between items-center pt-0.5">
            <span className="text-slate-500 font-bold uppercase text-[11px] flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-brand-700" />
              <span>Recorded Quantity</span>
            </span>
            <span className="font-mono font-black text-brand-900 text-sm">
              {data.quantity}
            </span>
          </div>

        </div>

        {/* Sync Status Note */}
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-[11px] text-emerald-900 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Record committed to local factory database & queued for cloud sync.</span>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 bg-brand-900 hover:bg-brand-800 active:scale-98 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition flex items-center justify-center space-x-2"
        >
          <span>Record Next Entry</span>
          <ArrowRight className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
}
