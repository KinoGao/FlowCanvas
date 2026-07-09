package com.infinitecanvas.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/prompts")
public class PromptController {
    private static final String GPT_IMAGE_2_RAW_BASE = "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main";
    private static final String AWESOME_GPT_IMAGE_RAW_BASE = "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main";
    private static final String AWESOME_GPT4O_IMAGE_PROMPTS_BASE = "https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main";
    private static final String YOUMIND_GPT_IMAGE_2_RAW_BASE = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main";
    private static final String YOUMIND_NANO_BANANA_PRO_RAW_BASE = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main";
    private static final String DAVID_WU_GPT_IMAGE_2_RAW_BASE = "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main";
    private static final List<String> GPT_IMAGE_2_CASE_FILES = List.of("README.md", "cases/ad-creative.md", "cases/character.md", "cases/comparison.md", "cases/ecommerce.md", "cases/portrait.md", "cases/poster.md", "cases/ui.md");
    private static final long CACHE_TTL_MS = 1000L * 60L * 60L;

    private final WebClient webClient = WebClient.builder().build();
    private Cache cache;

    @GetMapping
    public Map<String, Object> list(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(name = "tag", required = false) List<String> tags,
            @RequestParam(defaultValue = "") String category,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize
    ) {
        List<Prompt> items = getPrompts();
        String normalizedKeyword = keyword.trim().toLowerCase();
        List<String> normalizedTags = tags == null ? List.of() : tags.stream().filter(item -> item != null && !item.isBlank()).toList();
        List<Prompt> withoutTagFilter = filterPrompts(items, normalizedKeyword, category, List.of());
        List<Prompt> filtered = filterPrompts(items, normalizedKeyword, category, normalizedTags);
        int safePage = Math.max(1, page);
        int safePageSize = Math.max(1, Math.min(100, pageSize));
        int from = Math.min(filtered.size(), (safePage - 1) * safePageSize);
        int to = Math.min(filtered.size(), from + safePageSize);
        return Map.of(
                "items", filtered.subList(from, to),
                "tags", collectTags(withoutTagFilter),
                "categories", categories(),
                "total", filtered.size()
        );
    }

    private synchronized List<Prompt> getPrompts() {
        long now = System.currentTimeMillis();
        if (cache != null && now - cache.fetchedAt < CACHE_TTL_MS) return cache.items;
        List<Prompt> items = new ArrayList<>();
        buildSafely(items, "gpt-image-2-prompts", this::buildGptImage2Prompts);
        buildSafely(items, "awesome-gpt-image", this::buildAwesomeGptImagePrompts);
        buildSafely(items, "awesome-gpt4o-image-prompts", this::buildAwesomeGpt4oImagePrompts);
        buildSafely(items, "youmind-gpt-image-2", () -> buildYouMindPrompts(YOUMIND_GPT_IMAGE_2_RAW_BASE, "youmind-gpt-image-2", "gpt-image-2"));
        buildSafely(items, "youmind-nano-banana-pro", () -> buildYouMindPrompts(YOUMIND_NANO_BANANA_PRO_RAW_BASE, "youmind-nano-banana-pro", "nano-banana-pro"));
        buildSafely(items, "davidwu-gpt-image2-prompts", this::buildDavidWuGptImage2Prompts);
        cache = new Cache(items, now);
        return items;
    }

    private void buildSafely(List<Prompt> target, String category, PromptBuilder builder) {
        try {
            builder.build().forEach(item -> target.add(item.withCategory(category)));
        } catch (Exception ignored) {
        }
    }

    private List<Prompt> buildGptImage2Prompts() {
        String json = fetchText(GPT_IMAGE_2_RAW_BASE, "data/ingested_tweets.json");
        Map<String, String> cases = new HashMap<>();
        GPT_IMAGE_2_CASE_FILES.parallelStream().map(file -> fetchText(GPT_IMAGE_2_RAW_BASE, file)).forEach(markdown -> collectGptImage2Cases(cases, markdown));
        List<Prompt> result = new ArrayList<>();
        Matcher matcher = Pattern.compile("\\{[^{}]*?\"title\"\\s*:\\s*\"([^\"]*)\"[^{}]*?\"tweet_url\"\\s*:\\s*\"([^\"]*)\"[^{}]*?\"image_dir\"\\s*:\\s*\"([^\"]*)\"[^{}]*?(?:\"category\"\\s*:\\s*\"([^\"]*)\")?[^{}]*?(?:\"added_at\"\\s*:\\s*\"([^\"]*)\")?[^{}]*?\\}").matcher(json);
        while (matcher.find()) {
            String title = unescape(matcher.group(1));
            String tweetUrl = unescape(matcher.group(2));
            String imageDir = unescape(matcher.group(3));
            String category = matcher.group(4) == null ? "" : unescape(matcher.group(4));
            String addedAt = matcher.group(5) == null ? "" : unescape(matcher.group(5));
            String prompt = cases.get(tweetUrl);
            if (title.isBlank() || prompt == null || imageDir.isBlank()) continue;
            String image = GPT_IMAGE_2_RAW_BASE + "/" + imageDir + "/output.jpg";
            result.add(defaultPrompt("gpt-image-2-prompts-" + leftPad(result.size() + 1), title, prompt, image, tagsFromCategory(category), markdownPreview(List.of(image)), addedAt));
        }
        return result;
    }

    private void collectGptImage2Cases(Map<String, String> cases, String markdown) {
        Matcher matcher = Pattern.compile("### Case \\d+: \\[[^]]+]\\(([^)]+)\\)[\\s\\S]*?\\*\\*Prompt:\\*\\*\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n([\\s\\S]*?)\\r?\\n```", Pattern.MULTILINE).matcher(markdown);
        while (matcher.find()) cases.put(matcher.group(1), matcher.group(2).trim());
    }

    private List<Prompt> buildAwesomeGptImagePrompts() {
        String markdown = fetchText(AWESOME_GPT_IMAGE_RAW_BASE, "README.zh-CN.md");
        List<Prompt> result = new ArrayList<>();
        for (String section : splitBeforeHeading(markdown, "## ")) {
            List<String> tags = tagsFromHeading(firstMatch(section, Pattern.compile("^##\\s+(.+)$", Pattern.MULTILINE)));
            for (String block : splitBeforeHeading(section, "### ")) {
                String title = firstMatch(block, Pattern.compile("^###\\s+(.+)$", Pattern.MULTILINE)).replaceAll("\\[([^]]+)]\\([^)]+\\)", "$1").trim();
                String prompt = firstMatch(block, Pattern.compile("\\*\\*提示词:\\*\\*\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n([\\s\\S]*?)\\r?\\n```", Pattern.MULTILINE)).trim();
                if (title.isBlank() || prompt.isBlank()) continue;
                List<String> images = extractMarkdownImages(AWESOME_GPT_IMAGE_RAW_BASE, block);
                result.add(defaultPrompt("awesome-gpt-image-" + leftPad(result.size() + 1), title, prompt, images.isEmpty() ? "" : images.getFirst(), tags, markdownPreview(images), ""));
            }
        }
        return result;
    }

    private List<Prompt> buildAwesomeGpt4oImagePrompts() {
        String markdown = fetchText(AWESOME_GPT4O_IMAGE_PROMPTS_BASE, "README.zh-CN.md");
        List<Prompt> result = new ArrayList<>();
        for (String block : splitBeforeHeading(markdown, "### ")) {
            String title = firstMatch(block, Pattern.compile("^###\\s+(.+)$", Pattern.MULTILINE)).trim();
            String prompt = firstMatch(block, Pattern.compile("- \\*\\*提示词文本：\\*\\*\\s*`([\\s\\S]*?)`", Pattern.MULTILINE)).trim();
            if (title.isBlank() || prompt.isBlank()) continue;
            List<String> images = extractMarkdownImages(AWESOME_GPT4O_IMAGE_PROMPTS_BASE, block);
            result.add(defaultPrompt("awesome-gpt4o-image-prompts-" + leftPad(result.size() + 1), title, prompt, images.isEmpty() ? "" : images.getFirst(), List.of("gpt4o"), markdownPreview(images), ""));
        }
        return result;
    }

    private List<Prompt> buildYouMindPrompts(String baseUrl, String idPrefix, String modelTag) {
        String markdown = fetchText(baseUrl, "README_zh.md");
        List<Prompt> result = new ArrayList<>();
        for (String block : splitBeforeHeading(markdown, "### ")) {
            String title = firstMatch(block, Pattern.compile("^###\\s+No\\.\\s*\\d+:\\s*(.+)$", Pattern.MULTILINE)).trim();
            String prompt = firstMatch(block, Pattern.compile("#### [\\s\\S]*?提示词\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n([\\s\\S]*?)\\r?\\n```", Pattern.MULTILINE)).trim();
            if (title.isBlank() || prompt.isBlank()) continue;
            List<String> images = extractMarkdownImages(baseUrl, block);
            List<String> tags = new ArrayList<>();
            tags.add(modelTag);
            tags.addAll(tagsFromHeading(title.split(" - ")[0]));
            result.add(defaultPrompt(idPrefix + "-" + leftPad(result.size() + 1), title, prompt, images.isEmpty() ? "" : images.getFirst(), tags, markdownPreview(images), ""));
        }
        return result;
    }

    private List<Prompt> buildDavidWuGptImage2Prompts() {
        String json = fetchText(DAVID_WU_GPT_IMAGE_2_RAW_BASE, "prompts.json");
        List<Prompt> result = new ArrayList<>();
        Matcher matcher = Pattern.compile("\\{[\\s\\S]*?\"title_cn\"\\s*:\\s*\"([^\"]*)\"[\\s\\S]*?\"prompt\"\\s*:\\s*\"([^\"]*)\"[\\s\\S]*?(?:\"category_cn\"\\s*:\\s*\"([^\"]*)\")?[\\s\\S]*?(?:\"image\"\\s*:\\s*\"([^\"]*)\")?[\\s\\S]*?\\}").matcher(json);
        while (matcher.find()) {
            String title = unescape(matcher.group(1));
            String prompt = unescape(matcher.group(2));
            if (title.isBlank() || prompt.isBlank()) continue;
            String image = absoluteImage(DAVID_WU_GPT_IMAGE_2_RAW_BASE, matcher.group(4) == null ? "" : unescape(matcher.group(4)));
            result.add(defaultPrompt("davidwu-gpt-image2-prompts-" + leftPad(result.size() + 1), title, prompt, image, tagsFromCategory(matcher.group(3) == null ? "" : unescape(matcher.group(3))), markdownPreview(image.isBlank() ? List.of() : List.of(image)), ""));
        }
        return result;
    }

    private List<Prompt> filterPrompts(List<Prompt> items, String keyword, String category, List<String> tags) {
        return items.stream().filter(item -> {
            if (category != null && !category.isBlank() && !"全部".equals(category) && !item.category.equals(category)) return false;
            if (!tags.isEmpty() && tags.stream().noneMatch(item.tags::contains)) return false;
            if (keyword == null || keyword.isBlank()) return true;
            return (item.title + " " + item.prompt + " " + item.category + " " + String.join(" ", item.tags)).toLowerCase().contains(keyword);
        }).toList();
    }

    private List<String> collectTags(List<Prompt> items) {
        return items.stream().flatMap(item -> item.tags.stream()).filter(tag -> tag != null && !tag.isBlank()).distinct().sorted().toList();
    }

    private List<String> categories() {
        return List.of("gpt-image-2-prompts", "awesome-gpt-image", "awesome-gpt4o-image-prompts", "youmind-gpt-image-2", "youmind-nano-banana-pro", "davidwu-gpt-image2-prompts");
    }

    private String fetchText(String baseUrl, String file) {
        return webClient.get().uri(baseUrl + "/" + file).retrieve().bodyToMono(String.class).block(Duration.ofSeconds(20));
    }

    private Prompt defaultPrompt(String id, String title, String prompt, String coverUrl, List<String> tags, String preview, String createdAt) {
        return new Prompt(id, title, coverUrl, prompt, tags, "", preview, createdAt, createdAt);
    }

    private List<String> splitBeforeHeading(String markdown, String prefix) {
        List<String> blocks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String line : markdown.split("\\n")) {
            if (line.startsWith(prefix) && !current.isEmpty()) {
                blocks.add(current.toString());
                current = new StringBuilder();
            }
            current.append(line).append('\n');
        }
        blocks.add(current.toString());
        return blocks;
    }

    private String firstMatch(String value, Pattern pattern) {
        Matcher matcher = pattern.matcher(value);
        return matcher.find() ? matcher.group(1) : "";
    }

    private List<String> extractMarkdownImages(String baseUrl, String markdown) {
        Matcher matcher = Pattern.compile("!\\[[^]]*]\\(([^)]+)\\)").matcher(markdown);
        List<String> images = new ArrayList<>();
        while (matcher.find()) {
            String image = absoluteImage(baseUrl, matcher.group(1));
            if (!image.isBlank()) images.add(image);
        }
        return images;
    }

    private String absoluteImage(String baseUrl, String image) {
        if (image == null || image.isBlank()) return "";
        if (image.matches("(?i)^https?://.*")) return image;
        return baseUrl + "/" + image.replaceFirst("^\\.?/", "");
    }

    private List<String> tagsFromCategory(String category) {
        return splitTags(category == null ? "" : category.replaceAll("(?i)\\s+Cases$", ""), "\\s*(?:&|and)\\s*");
    }

    private List<String> tagsFromHeading(String heading) {
        return splitTags(heading == null ? "" : heading.replaceAll("[^\\p{L}\\p{N}/&、与 ]", ""), "\\s*(?:/|&|、|与)\\s*");
    }

    private List<String> splitTags(String value, String pattern) {
        return Arrays.stream(value.split(pattern)).map(String::trim).map(String::toLowerCase).filter(item -> !item.isBlank()).toList();
    }

    private String markdownPreview(List<String> images) {
        return images.stream().filter(item -> !item.isBlank()).map(item -> "![](" + item + ")").collect(Collectors.joining("\n\n"));
    }

    private String leftPad(int value) {
        return String.format("%03d", value);
    }

    private String unescape(String value) {
        return value == null ? "" : value.replace("\\\"", "\"").replace("\\n", "\n");
    }

    private interface PromptBuilder { List<Prompt> build(); }
    private record Cache(List<Prompt> items, long fetchedAt) {}
    public record Prompt(String id, String title, String coverUrl, String prompt, List<String> tags, String category, String preview, String createdAt, String updatedAt) {
        Prompt withCategory(String category) { return new Prompt(id, title, coverUrl, prompt, tags, category, preview, createdAt, updatedAt); }
    }
}
