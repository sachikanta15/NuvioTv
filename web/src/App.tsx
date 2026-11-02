import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/Spinner";
import { useThemeSync } from "@/hooks/useThemeSync";
import { useSettings } from "@/store/settings";
import { useAddons } from "@/store/addons";
import { useProfiles } from "@/store/profiles";

// Screens are code-split so the first paint stays light.
const OnboardingScreen = lazy(() =>
  import("@/screens/Onboarding").then((module) => ({ default: module.OnboardingScreen })),
);
const HomeScreen = lazy(() =>
  import("@/screens/Home").then((module) => ({ default: module.HomeScreen })),
);
const DiscoverScreen = lazy(() =>
  import("@/screens/Discover").then((module) => ({ default: module.DiscoverScreen })),
);
const SearchScreen = lazy(() =>
  import("@/screens/Search").then((module) => ({ default: module.SearchScreen })),
);
const LibraryScreen = lazy(() =>
  import("@/screens/Library").then((module) => ({ default: module.LibraryScreen })),
);
const CollectionsScreen = lazy(() =>
  import("@/screens/Collections").then((module) => ({ default: module.CollectionsScreen })),
);
const CollectionDetailScreen = lazy(() =>
  import("@/screens/CollectionDetail").then((module) => ({
    default: module.CollectionDetailScreen,
  })),
);
const AddonsScreen = lazy(() =>
  import("@/screens/Addons").then((module) => ({ default: module.AddonsScreen })),
);
const SettingsScreen = lazy(() =>
  import("@/screens/Settings").then((module) => ({ default: module.SettingsScreen })),
);
const AboutScreen = lazy(() =>
  import("@/screens/About").then((module) => ({ default: module.AboutScreen })),
);
const AccountScreen = lazy(() =>
  import("@/screens/Account").then((module) => ({ default: module.AccountScreen })),
);
const ProfilesScreen = lazy(() =>
  import("@/screens/Profiles").then((module) => ({ default: module.ProfilesScreen })),
);
const DetailScreen = lazy(() =>
  import("@/screens/Detail").then((module) => ({ default: module.DetailScreen })),
);
const StreamsScreen = lazy(() =>
  import("@/screens/Streams").then((module) => ({ default: module.StreamsScreen })),
);
const BrowseScreen = lazy(() =>
  import("@/screens/Browse").then((module) => ({ default: module.BrowseScreen })),
);
const JioTvScreen = lazy(() =>
  import("@/screens/JioTv").then((module) => ({ default: module.JioTvScreen })),
);
const VzyScreen = lazy(() =>
  import("@/screens/Vzy").then((module) => ({ default: module.VzyScreen })),
);
const NotFoundScreen = lazy(() =>
  import("@/screens/NotFound").then((module) => ({ default: module.NotFoundScreen })),
);
const IndiaCollectionScreen = lazy(() =>
  import("@/screens/IndiaCollection").then((module) => ({
    default: module.IndiaCollectionScreen,
  })),
);
const WatchPartyScreen = lazy(() =>
  import("@/screens/WatchParty").then((module) => ({ default: module.WatchPartyScreen })),
);
const TrackingScreen = lazy(() =>
  import("@/screens/Tracking").then((module) => ({ default: module.TrackingScreen })),
);
const AmbientScreen = lazy(() =>
  import("@/screens/Ambient").then((module) => ({ default: module.AmbientScreen })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size={32} />
    </div>
  );
}

/** Redirects to onboarding until the user has completed setup. */
function RequireOnboarded({ children }: { children: React.ReactNode }) {
  const onboarded = useSettings((state) => state.onboarded);
  const location = useLocation();
  if (!onboarded) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export default function App() {
  useThemeSync();
  const onboarded = useSettings((state) => state.onboarded);
  const initDefaults = useAddons((state) => state.initDefaults);
  const ensureProfiles = useProfiles((state) => state.ensureProfiles);

  useEffect(() => {
    ensureProfiles();
    if (onboarded) void initDefaults();
  }, [ensureProfiles, initDefaults, onboarded]);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/onboarding"
          element={onboarded ? <Navigate to="/" replace /> : <OnboardingScreen />}
        />

        <Route
          path="/ambient"
          element={
            <RequireOnboarded>
              <AmbientScreen />
            </RequireOnboarded>
          }
        />

        <Route
          element={
            <RequireOnboarded>
              <AppShell />
            </RequireOnboarded>
          }
        >
          <Route index element={<HomeScreen />} />
          <Route path="/discover" element={<DiscoverScreen />} />
          <Route path="/india/:collectionId" element={<IndiaCollectionScreen />} />
          <Route path="/jiotv" element={<JioTvScreen />} />
          <Route path="/vzy" element={<VzyScreen />} />
          <Route path="/tataplay" element={<Navigate to="/jiotv" replace />} />
          <Route path="/party" element={<WatchPartyScreen />} />
          <Route path="/tracking" element={<TrackingScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/library" element={<LibraryScreen />} />
          <Route path="/collections" element={<CollectionsScreen />} />
          <Route path="/collections/:collectionId" element={<CollectionDetailScreen />} />
          <Route path="/addons" element={<AddonsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/account" element={<AccountScreen />} />
          <Route path="/about" element={<AboutScreen />} />
          <Route path="/profiles" element={<ProfilesScreen />} />
          <Route path="/detail/:type/:id" element={<DetailScreen />} />
          <Route path="/stream/:type/:id" element={<StreamsScreen />} />
          <Route path="/browse/:transportUrl/:type/:catalogId" element={<BrowseScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
