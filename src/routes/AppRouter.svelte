<script>
  import { Router, Route } from "svelte-routing";

  import Login from "./pages/Login.svelte";
  import Register from "./pages/Register.svelte";
  import AppShellPage from "./app/AppShell.svelte";
  import QrScanner from './staff/scanner/+page.svelte';
  import AdminAppShell from "./admin/AdminAppShell.svelte";
  import { Toaster } from "svelte-sonner";
</script>

<Toaster/>

<Router>

  <!-- Default -->
  <Route path="/" component={Login} />

  <!-- Público -->
  <Route path="/login" component={Login} />
  <Route path="/register" component={Register} />

  <!-- App (privada) -->
  <Route path="/app/*" component={AppShellPage} />

  <!-- App con scan para organizadores-->
  <Route path="/staff/qr-scanner" component={QrScanner} />

  <!-- Rutas de organizadores (admins)-->
  <Route path="/admin/*" component={AdminAppShell} />

</Router>
