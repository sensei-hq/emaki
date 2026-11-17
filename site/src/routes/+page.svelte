<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import HeroSection from '$lib/components/HeroSection.svelte';
	import ProofStrip from '$lib/components/ProofStrip.svelte';
	import FeaturesSection from '$lib/components/FeaturesSection.svelte';
	import PackagesSection from '$lib/components/PackagesSection.svelte';
	import ShowcaseSection from '$lib/components/ShowcaseSection.svelte';
	import UsageSection from '$lib/components/UsageSection.svelte';
	import PluginSection from '$lib/components/PluginSection.svelte';
	import CtaSection from '$lib/components/CtaSection.svelte';
	import { brand } from '$lib/data';
</script>

<Seo title="emaki: motion stories for articles, players and video" description={brand.tagline} />

<span id="top"></span>
<HeroSection />
<ProofStrip />
<FeaturesSection />
<PackagesSection />
<ShowcaseSection />
<UsageSection />
<PluginSection />
<CtaSection />
