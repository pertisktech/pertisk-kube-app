#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PTKUBLET_URL || "http://localhost:3000").replace(/\/$/, "");
const outputDirectory = path.resolve(process.env.PTKUBLET_OUT || "../docs/screenshots");
const viewport = {
  width: Number(process.env.PTKUBLET_WIDTH || 1600),
  height: Number(process.env.PTKUBLET_HEIGHT || 1000),
};

async function capture(page, route, name) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("main").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(750);
  await captureCurrentPage(page, name);
}

async function captureCurrentPage(page, name) {
  const file = path.join(outputDirectory, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("wrote", path.relative(process.cwd(), file));
}

const menuRoutes = [
  ["/", "dashboard"],
  ["/nodes", "nodes"],
  ["/workloads", "workloads-overview"],
  ["/pods", "pods"],
  ["/deployments", "deployments"],
  ["/statefulsets", "statefulsets"],
  ["/daemonsets", "daemonsets"],
  ["/replicasets", "replicasets"],
  ["/jobs", "jobs"],
  ["/cronjobs", "cronjobs"],
  ["/config/configmaps", "config-maps"],
  ["/config/secrets", "secrets"],
  ["/config/resourcequotas", "resource-quotas"],
  ["/config/limitranges", "limit-ranges"],
  ["/config/hpa", "hpa"],
  ["/config/pdb", "pdb"],
  ["/config/priorityclasses", "priority-classes"],
  ["/config/runtimeclasses", "runtime-classes"],
  ["/config/leases", "leases"],
  ["/config/mwc", "mutating-webhooks"],
  ["/config/vwc", "validating-webhooks"],
  ["/network", "network-overview"],
  ["/network/services", "services"],
  ["/network/endpoints", "endpoints"],
  ["/network/ingresses", "ingresses"],
  ["/network/ingressclasses", "ingress-classes"],
  ["/network/networkpolicies", "network-policies"],
  ["/network/portforwarding", "port-forwarding"],
  ["/storage", "storage-overview"],
  ["/storage/pvc", "persistent-volume-claims"],
  ["/storage/pv", "persistent-volumes"],
  ["/storage/storageclasses", "storage-classes"],
  ["/namespaces", "namespaces"],
  ["/events", "events"],
  ["/helm/charts", "helm-charts"],
  ["/helm/releases", "helm-releases"],
  ["/access-control", "access-control"],
  ["/access-control/serviceaccounts", "service-accounts"],
  ["/access-control/clusterroles", "cluster-roles"],
  ["/access-control/roles", "roles"],
  ["/access-control/clusterrolebindings", "cluster-role-bindings"],
  ["/access-control/rolebindings", "role-bindings"],
  ["/cluster", "cluster"],
  ["/resource-map", "resource-map"],
];

const expandableMenus = [
  "Workloads",
  "Config",
  "Networks",
  "Storage",
  "Helm",
  "Access Control",
  "Custom Resources",
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport,
  deviceScaleFactor: Number(process.env.PTKUBLET_DPR || 1),
});

try {
  await mkdir(outputDirectory, { recursive: true });
  for (const [route, name] of menuRoutes) {
    await capture(page, route, name);
  }

  await capture(page, "/", "dashboard");
  for (const menuName of expandableMenus) {
    await page.getByRole("button", { name: menuName, exact: true }).click();
    await page.waitForTimeout(250);
    await captureCurrentPage(page, `menu-${menuName.toLowerCase().replaceAll(" ", "-")}`);
    await page.getByRole("button", { name: menuName, exact: true }).click();
  }

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForTimeout(250);
  await captureCurrentPage(page, "action-sidebar-collapsed");
  await page.getByRole("button", { name: "Expand sidebar" }).click();

  await page.getByTitle("Add tab").click();
  await page.waitForTimeout(250);
  await captureCurrentPage(page, "action-new-tab");
  console.log("done");
} finally {
  await browser.close();
}