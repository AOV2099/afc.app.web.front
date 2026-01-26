<script>
  import { Router, Route } from "svelte-routing";

  import Login from "./pages/Login.svelte";
  import AppShellPage from "./app/AppShell.svelte";
</script>

<Router>
  <!-- Público -->
  <Route path="/login" component={Login} />

  <!-- App (privada) -->
  <Route path="/app/*" component={AppShellPage} />

  <!-- App con scan para organizadores-->
  <Route path="/staff/*" component={AppShellPage} />

  <!-- Default -->
  <Route path="/" component={Login} />
</Router>
