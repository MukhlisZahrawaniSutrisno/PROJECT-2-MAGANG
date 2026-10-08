"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, LayoutGrid, Users, BookOpen, ArrowUpRight, ChevronRight, ChevronDown, Command, MessageCircle, Check, X, CalendarDays, CircleHelp, LogOut, Menu, Sparkles, FileText, BarChart3, CircleAlert, ShieldCheck, RotateCcw, Bookmark, ArrowRight, CircleCheck } from "lucide-react";
import { AdminPanel, type AdminSection } from "./admin-panel";
import { Avatar, initials, LinkButton, EmptyState, PageHeading, ProblemCard, ResultCard, ProblemDetail } from "./cards";
import { api, Login } from "./login";
import { createSeedData } from "@/lib/seed";
import { loadDemoData, saveDemoData, applyDemoCommand, recordDemoSearch, STORAGE_KEY } from "@/lib/demo-store";
import { searchProblems, isEmployeeAvailable } from "@/lib/search";
import { CATEGORIES, type AppData, type Bootstrap, type Problem, type AdminCommand, type SearchResult, type SearchLog, type CurrentUser, type Category } from "@/lib/types";
type View = "search" | "directory" | "sops" | "saved" | AdminSection;
const DEMO_USER: CurrentUser = { id: "demo", name: "Alex Morgan", email: "alex@example.com", role: "admin" };
const FAVORITES_KEY = "whose-job-favorites-v1";
export function Workspace() {
  const [mode, setMode] = useState<"demo" | "live">("live");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true); const [fatal, setFatal] = useState("");
  const [view, setView] = useState<View>("search"); const [mobileNav, setMobileNav] = useState(false); const [compact, setCompact] = useState(false);
  const [query, setQuery] = useState(""); const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [category, setCategory] = useState<Category | "Semua">("Semua");
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState(""); const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<SearchResult | null>(null); const [favorites, setFavorites] = useState<string[]>([]);
  const [help, setHelp] = useState(false); const [profileOpen, setProfileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null); const detailRef = useRef<HTMLDialogElement>(null); const helpRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<{ query: string; id: string } | null>(null);
  async function bootstrap() {
    setLoading(true); setFatal("");
    try {
      const value = await api<Bootstrap>("/api/bootstrap"); setMode(value.mode);
      if (value.mode === "demo") { setData(loadDemoData()); setUser(DEMO_USER); }
      else { setData(value.data); setUser(value.user); }
      try { const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); if (Array.isArray(stored)) setFavorites(stored.filter((s): s is string => typeof s === "string")); } catch { /* Optional favorites do not affect catalog. */ }
    } catch (error) { setFatal(error instanceof Error ? error.message : "Website belum dapat dimuat."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void bootstrap(); }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setCompact(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") { setMobileNav(false); setProfileOpen(false); } if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); setView("search"); setTimeout(() => inputRef.current?.focus(), 0); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (selected) detailRef.current?.showModal(); }, [selected]);
  useEffect(() => { if (help) helpRef.current?.showModal(); }, [help]);
  function navigate(next: View) { setView(next); setMobileNav(false); setCategory("Semua"); setProfileOpen(false); }
  async function doSearch(value: string) {
    if (!data || busy) return;
    setQuery(value); setSearchError("");
    if (!value.trim()) { setSearchError("Tulis masalah yang ingin dicari terlebih dahulu."); inputRef.current?.focus(); return; }
    setBusy(true); setView("search"); setCategory("Semua");
    // A retry reuses the operation ID so a lost response cannot duplicate the log.
    if (!requestRef.current || requestRef.current.query !== value) requestRef.current = { query: value, id: crypto.randomUUID() };
    try {
      let log: SearchLog;
      if (mode === "demo") { const next = recordDemoSearch(data, value, requestRef.current.id); saveDemoData(next.data); setData(next.data); log = next.log; }
      else {
        log = await api<SearchLog>("/api/search", { query: value, requestId: requestRef.current.id });
        if (user?.role === "admin") { try { const fresh = await api<Bootstrap>("/api/bootstrap"); setData(fresh.data); setUser(fresh.user); } catch { setToast("Hasil ditemukan. Analitik belum diperbarui; muat ulang dashboard."); } }
      }
      setResults(log.results); setSubmittedQuery(value); requestRef.current = null;
    } catch (error) { setSearchError(error instanceof Error ? error.message : "Pencarian belum berhasil. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function command(value: AdminCommand) {
    if (!data || user?.role !== "admin") throw new Error("Hanya admin yang dapat mengubah data.");
    let next: AppData;
    if (mode === "demo") { next = applyDemoCommand(data, value); saveDemoData(next); }
    else next = await api<AppData>("/api/admin", value);
    setData(next); setToast("Perubahan berhasil disimpan."); setResults(null); setSubmittedQuery("");
  }
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); setFavorites(next); }
    catch { setToast("Favorit belum tersimpan. Periksa izin penyimpanan browser."); }
  }
  function openProblem(problem: Problem) {
    if (!data) return;
    if (mode === "live") { void doSearch(problem.keywords[0] || problem.title); return; }
    const result = searchProblems(data, problem.keywords[0] || problem.title).find((item) => item.problem.id === problem.id);
    if (result) setSelected(result);
  }
  function changeDemoRole() {
    if (mode !== "demo" || !user) return;
    const role = user.role === "admin" ? "employee" : "admin";
    setUser({ ...user, role }); setView("search"); setProfileOpen(false); setToast(`Pratinjau tampilan ${role === "admin" ? "admin" : "karyawan"}.`);
  }
  async function logout() {
    try { await api("/api/auth/logout", {}); setUser(null); setData(null); setResults(null); setView("search"); }
    catch (error) { setToast(error instanceof Error ? error.message : "Belum berhasil keluar."); }
  }
  function resetDemo() {
    if (!window.confirm("Hapus perubahan demo dan kembalikan data contoh?")) return;
    try { const seed = createSeedData(); saveDemoData(seed); setData(seed); setResults(null); setSelected(null); setToast("Data demo sudah dikembalikan."); }
    catch { setToast("Data demo belum dapat dikembalikan."); }
  }
  if (loading) return <div className="loading-screen"><div className="loading-mark"><Command size={30} /></div><p>Menyiapkan meja bantuan Anda…</p></div>;
  if (fatal) return <div className="login-screen"><div className="login-card"><CircleAlert size={36} /><h1>Website belum dapat dimuat</h1><p>{fatal}</p><button className="btn btn-primary" onClick={() => void bootstrap()}>Coba lagi</button>{mode === "demo" && <button className="btn btn-secondary" onClick={() => { if (window.confirm("Hapus data demo yang rusak?")) { localStorage.removeItem(STORAGE_KEY); void bootstrap(); } }}>Kembalikan data demo</button>}</div></div>;
  if (!user || !data) return <Login onLogin={bootstrap} />;
  const activeProblems = data.problems.filter((p) => p.isActive);
  const activeEmployees = data.employees.filter((e) => e.isActive);
  const visibleProblems = activeProblems.filter((p) => (category === "Semua" || p.category === category) && (view !== "saved" || favorites.includes(p.id)));
  const visibleResults = results?.filter((r) => category === "Semua" || r.problem.category === category);
  const adminView = ["overview", "problems", "employees", "availability", "unmatched"].includes(view);
  const openUnmatched = data.unmatchedQueries.filter((q) => q.status === "open").length;
  const names: Record<View, string> = { search: "Temukan PIC", directory: "Direktori tim", sops: "SOP & formulir", saved: "Tersimpan", overview: "Dashboard admin", problems: "Kelola masalah", employees: "Kelola PIC", availability: "Availability", unmatched: "Query belum cocok" };
  return <div className="workspace">
    <a href="#main-content" className="skip-link">Langsung ke konten</a>
    {mobileNav && <button className="nav-scrim" aria-label="Tutup navigasi" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`} aria-label="Navigasi utama" inert={compact && !mobileNav}>
      <button className="brand" onClick={() => navigate("search")} aria-label="Whose Job Is It Anyway? Beranda"><span className="brand-symbol"><Command size={24} strokeWidth={2.5} /></span><span>whose job<span className="brand-question">is it anyway?</span></span><span className="brand-dot" /></button>
      <div className="workspace-label"><span className="workspace-emblem">W</span><div>Workspace kantor<small>People, connected.</small></div><ChevronDown size={14} /></div>
      <p className="nav-label">Workspace</p><nav>
        <NavButton icon={<Search size={19} />} active={view === "search"} onClick={() => navigate("search")}>Temukan PIC</NavButton>
        <NavButton icon={<Users size={19} />} active={view === "directory"} onClick={() => navigate("directory")}>Direktori tim</NavButton>
        <NavButton icon={<BookOpen size={19} />} active={view === "sops"} onClick={() => navigate("sops")}>SOP & formulir</NavButton>
        <NavButton icon={<Bookmark size={19} />} active={view === "saved"} onClick={() => navigate("saved")}>Tersimpan<span className="nav-count" aria-hidden="true">{favorites.length}</span></NavButton>
        {user.role === "admin" && <><p className="nav-label nav-label-admin">Administrasi</p>
          <NavButton icon={<BarChart3 size={19} />} active={view === "overview"} onClick={() => navigate("overview")}>Ringkasan</NavButton>
          <NavButton icon={<LayoutGrid size={19} />} active={view === "problems"} onClick={() => navigate("problems")}>Kelola masalah</NavButton>
          <NavButton icon={<ShieldCheck size={19} />} active={view === "employees"} onClick={() => navigate("employees")}>Kelola PIC</NavButton>
          <NavButton icon={<CalendarDays size={19} />} active={view === "availability"} onClick={() => navigate("availability")}>Availability</NavButton>
          <NavButton icon={<MessageCircle size={19} />} active={view === "unmatched"} onClick={() => navigate("unmatched")}>Query belum cocok{openUnmatched > 0 && <span className="nav-count nav-count-purple" aria-hidden="true">{openUnmatched}</span>}</NavButton>
        </>}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><span className="help-icon"><Sparkles size={19} /></span><strong>Kerja lebih lancar.</strong><p>Orang yang tepat, untuk masalah yang tepat.</p><button onClick={() => setHelp(true)}>Kenali workspace <ArrowUpRight size={15} /></button></div><button className="sidebar-support" onClick={() => setHelp(true)}><CircleHelp size={18} /> Bantuan & panduan <ArrowUpRight size={15} /></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu" aria-label="Buka navigasi" onClick={() => setMobileNav(true)}><Menu size={22} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{names[view]}</strong></div><div className="topbar-right"><span className="internal-badge"><span />Internal workspace</span><div className="profile-wrap"><button className="profile-button" aria-label="Menu akun" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}><span className="user-avatar">{initials(user.name)}</span><span className="profile-info">{user.name}<small>{user.role === "admin" ? "Administrator" : "Karyawan"}</small></span><ChevronDown size={15} /></button>{profileOpen && <div className="profile-menu"><p>{user.email}</p>{mode === "demo" ? <><button onClick={changeDemoRole}><Users size={16} />Lihat sebagai {user.role === "admin" ? "karyawan" : "admin"}</button><button onClick={resetDemo}><RotateCcw size={16} />Reset data demo</button></> : <button onClick={() => void logout()}><LogOut size={16} />Keluar</button>}</div>}</div></div></header>
      {mode === "demo" && <div className="demo-strip"><span><span className="demo-dot" />Mode demo · Data contoh tersimpan di browser ini.</span><button onClick={() => setHelp(true)}>Tentang demo <ArrowUpRight size={12} /></button></div>}
      <main id="main-content" className="main-content">
        {adminView && user.role === "admin" ? <AdminPanel data={data} section={view as AdminSection} onCommand={command} /> : view === "directory" ? <><PageHeading title="Kenali orang di balik solusinya." description="Satu direktori untuk semua tim yang siap membantu." /><div className="directory-grid">{activeEmployees.map((person) => <article className="person-card" key={person.id}><Avatar person={person} /><h2>{person.name}</h2><p>{person.department}</p>{mode === "demo" && <span className={`status-badge ${isEmployeeAvailable(data, person.id) ? "status-green" : "status-amber"}`}><span />{isEmployeeAvailable(data, person.id) ? "Tersedia" : "Tidak tersedia"}</span>}<LinkButton url={person.chatUrl} className="btn btn-secondary"><MessageCircle size={16} />Kirim chat<ArrowUpRight size={15} /></LinkButton></article>)}</div></> : view === "sops" ? <><PageHeading title="Panduan yang Anda butuhkan." description="SOP, formulir, dan tiket operasional dalam satu tempat." /><div className="sop-list">{activeProblems.flatMap((problem) => problem.links.map((link) => <article key={`${problem.id}-${link.id}`} className="sop-row"><span className="category-icon category-0"><FileText size={23} /></span><div><h2>{link.label}</h2><p>{problem.title} <span className="text-muted">/ {link.kind === "sop" ? "SOP" : link.kind === "form" ? "Formulir" : "Tiket"}</span></p></div><LinkButton url={link.url} className="btn btn-secondary">Buka <ArrowUpRight size={15} /></LinkButton></article>))}{!activeProblems.some((p) => p.links.length) && <EmptyState title="Belum ada panduan" description="Admin dapat menambahkan SOP dan formulir melalui Kelola masalah." />}</div></> : <>
          {view === "saved" ? <PageHeading title="Bantuan, selalu dekat." description="Masalah yang Anda simpan untuk ditemukan kembali dengan cepat." /> : <><div className="welcome-row"><div><p className="greeting">Selamat datang, {user.name.split(" ")[0]} <span aria-hidden="true">✦</span></p><h1>Siapa yang bisa bantu?</h1></div><span className="today-label"><CalendarDays size={15} />{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date())}</span></div>
          <section className="search-hero" aria-label="Pencarian masalah"><div className="hero-copy"><span className="hero-pill"><Sparkles size={13} />Bantuan dimulai dari sini</span><h2>Ceritakan masalahnya.<br />Temukan orangnya.</h2><p>Dari AC bocor sampai akses Figma. Cari PIC yang tepat,<br className="desktop-break" /> tanpa harus tanya ke seluruh kantor.</p></div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-message"><MessageCircle size={20} /><span>Who can help?</span><span className="art-dots">•••</span></div><div className="art-profile art-profile-one"><span>RA</span><div><b>Right person.</b><small>Ready to help</small></div><span className="art-tick"><Check size={14} /></span></div><div className="art-profile art-profile-two"><span>DN</span><div><b>Right solution.</b><small>Let’s get it done</small></div></div><div className="art-star">✳</div><div className="art-small-dot" /></div>
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); void doSearch(query); }}><Search size={23} /><input ref={inputRef} aria-label="Cari masalah operasional" maxLength={200} placeholder="Apa yang sedang Anda butuhkan?" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd className="search-shortcut">Ctrl K</kbd><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Mencari…" : "Cari PIC"}<ArrowRight size={17} /></button></form>
          <div className="quick-search"><span>Coba cari:</span>{["AC bocor", "akses Figma", "reimburse", "WiFi"].map((word) => <button key={word} onClick={() => void doSearch(word)} disabled={busy}>{word}<ArrowUpRight size={12} /></button>)}</div></section>{searchError && <div className="error-banner" role="alert" aria-label="Pencarian gagal"><CircleAlert size={18} />{searchError}</div>}</>}
          <div className="home-columns"><div className="problem-area"><div className="section-heading"><div><h2>{view === "saved" ? "Masalah tersimpan" : results !== null ? `Hasil untuk “${submittedQuery}”` : "Bantuan sehari-hari"}</h2><p>{results !== null ? `${results.length} masalah cocok · PIC diprioritaskan berdasarkan availability` : "Mulai dari hal yang paling sering dibutuhkan."}</p></div>{results !== null && <button className="text-button" onClick={() => { setResults(null); setSubmittedQuery(""); setQuery(""); setSearchError(""); }}>Hapus pencarian<X size={15} /></button>}</div>
          <div className="category-tabs" aria-label="Kategori masalah">{["Semua", ...CATEGORIES].map((name) => <button key={name} aria-pressed={category === name} className={category === name ? "category-tab active" : "category-tab"} onClick={() => setCategory(name as Category | "Semua")}>{name}</button>)}</div>
          {results !== null && view !== "saved" ? results.length === 0 ? <EmptyState title="Belum menemukan yang cocok." description="Keyword Anda sudah dicatat untuk ditinjau HR/Ops. Coba istilah lain atau hubungi tim People Ops." icon={<Search size={30} />}><button className="btn btn-secondary" onClick={() => navigate("directory")}><Users size={16} />Lihat direktori tim</button></EmptyState> : !visibleResults?.length ? <EmptyState title="Tidak ada hasil di kategori ini" description="Pilih Semua untuk melihat hasil pencarian lainnya." /> : <div className="problem-grid">{visibleResults.map((result) => <ResultCard key={result.problem.id} result={result} saved={favorites.includes(result.problem.id)} onSave={() => toggleFavorite(result.problem.id)} onOpen={() => setSelected(result)} />)}</div> : visibleProblems.length ? <div className="problem-grid">{visibleProblems.slice(0, view === "saved" ? 100 : 6).map((problem) => <ProblemCard key={problem.id} problem={problem} employee={data.employees.find((e) => e.id === problem.primaryPicId)} saved={favorites.includes(problem.id)} onSave={() => toggleFavorite(problem.id)} onOpen={() => openProblem(problem)} />)}</div> : <EmptyState title={view === "saved" ? "Belum ada yang disimpan." : "Belum ada masalah di kategori ini."} description={view === "saved" ? "Klik ikon bookmark pada masalah untuk menyimpannya di sini." : "Pilih kategori lain atau tambahkan data melalui admin."} />}
          {results === null && view !== "saved" && <div className="catalog-footer"><span>{activeProblems.length} masalah dalam direktori</span><button className="text-button" onClick={() => navigate("sops")}>Jelajahi SOP & formulir<ArrowRight size={15} /></button></div>}</div>
          <aside className="home-aside"><section className="how-it-works"><span className="aside-heading-icon"><CircleHelp size={18} /></span><h2>Tak perlu lagi<br />“tanya siapa, ya?”</h2><p>Jalur singkat dari masalah<br />ke orang yang tepat.</p><ol><li><span>1</span><div><strong>Tulis masalah Anda</strong><p>Pakai bahasa sehari-hari.</p></div></li><li><span>2</span><div><strong>Temukan PIC-nya</strong><p>Lengkap dengan backup & SLA.</p></div></li><li><span>3</span><div><strong>Langsung terhubung</strong><p>Kirim chat atau buka formulir.</p></div></li></ol><button onClick={() => setHelp(true)}>Lihat panduan<ArrowUpRight size={15} /></button></section><section className="team-summary"><div className="team-avatar-stack">{activeEmployees.slice(0, 4).map((person) => <Avatar key={person.id} person={person} small />)}</div><strong>Tim Anda siap membantu.</strong><p>{activeEmployees.length} PIC dari berbagai departemen.</p><button className="text-button" onClick={() => navigate("directory")}>Kenali tim Anda<ArrowRight size={15} /></button></section><p className="aside-note"><ShieldCheck size={15} />Khusus internal. Dibuat untuk kita.</p></aside></div>
        </>}
        <footer className="page-footer"><span>Whose Job Is It Anyway?</span><span>Less guessing. More getting things done.</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><CircleCheck size={19} />{toast}<button onClick={() => setToast("")} aria-label="Tutup pesan"><X size={16} /></button></div>}
    <dialog ref={detailRef} className="detail-dialog" aria-label="Detail masalah dan PIC" onClose={() => setSelected(null)} onClick={(event) => { if (event.target === detailRef.current) detailRef.current?.close(); }}>{selected && <ProblemDetail result={selected} onClose={() => detailRef.current?.close()} />}</dialog>
    <dialog ref={helpRef} className="help-dialog" aria-label="Panduan workspace" onClose={() => setHelp(false)}><div className="dialog-head"><span className="category-icon category-0"><CircleHelp size={24} /></span><button className="icon-button" aria-label="Tutup panduan" onClick={() => helpRef.current?.close()}><X size={20} /></button></div><h2>Orang yang tepat, lebih cepat.</h2><p>Tulis masalah seperti “akses Figma” atau “AC bocor”. Kami menampilkan PIC utama, backup, target respons, serta SOP dan formulir terkait.</p><p>Jika PIC utama tidak tersedia, backup akan diprioritaskan. Bila keduanya tidak tersedia, Anda tetap dapat membuka formulir atau tiket.</p><p>Keyword yang belum cocok dicatat agar HR/Ops bisa melengkapi direktori.</p>{mode === "demo" && <div className="demo-help"><strong>Anda sedang mencoba data contoh.</strong><p>Semua nama, kontak, log, dan dokumen bersifat ilustratif. Perubahan tersimpan hanya di browser ini. Menu akun dapat digunakan untuk mencoba tampilan karyawan dan mereset demo.</p></div>}<button className="btn btn-primary" onClick={() => helpRef.current?.close()}>Mengerti<Check size={16} /></button></dialog>
  </div>;
}
function NavButton({ icon, active, onClick, children }: { icon: ReactNode; active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={`nav-button ${active ? "nav-active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>{icon}<span>{children}</span></button>;
}



