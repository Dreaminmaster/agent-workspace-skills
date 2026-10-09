# Ready-to-use prompts / 常用提问

Use these after the private Canvas connector has been enabled in the chat. Replace example course IDs and slugs with values from **your own live course list**.

## 1. Connection check / 连通性验收

@Canvas Live-list my courses and read the full body of the page `week-3-overview` in course ID `YOUR_COURSE_ID`. Show the returned course ID, actual page title and first paragraph. State exactly which calls succeeded; quote the error if a call fails. Never fabricate results.

## 2. Weekly study plan / 每周学习计划

@Canvas Check my currently enrolled courses, their week-overview pages, available module items, assignments and announcements. Make a day-by-day study checklist. Distinguish officially dated submissions from undated activities and show source links.

## 3. Assignment requirements / 作业要求

@Canvas In my course `COURSE_ID`, retrieve the assignment `ASSIGNMENT_NAME`, its published instructions, due date, grading criteria and relevant supporting links. Identify anything inaccessible or uncertain; do not guess.

## 4. Lecture summary / 课程内容

@Canvas Find the course page about `TOPIC`. Read the entire body rather than only the page index. Summarize in Chinese with original English terms and a direct link. State when linked PDFs or videos were not opened.

## 5. Verify completeness / 检查遗漏

@Canvas List every Canvas source you actually checked for this course. Which pages, modules, files or inbox items remain unchecked or are inaccessible? Report factual coverage and do not claim that 'nothing is due' simply because the upcoming list is empty.

## Cautions

- `@Canvas` is a placeholder for each user's installed private connector name. In one successful private test, its display name was `@USYD Canvas`.
- These prompts **cannot** create a working API connection by themselves.
- Never include a real token in prompts, repositories or screenshots.