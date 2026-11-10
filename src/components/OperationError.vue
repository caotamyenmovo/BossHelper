<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ message: string }>()
const technical = computed(
  () =>
    /Type validation failed|invalid_union|schema validation/i.test(props.message) ||
    props.message.length > 450,
)
const summary = computed(() =>
  /Type validation failed|invalid_union|schema validation/i.test(props.message)
    ? 'AI 接口返回的数据格式不兼容。请核对当前模型的接口协议，或联系服务商检查响应格式后重试。'
    : props.message.length > 450
      ? props.message.slice(0, 200) + '…'
      : props.message,
)
</script>

<template>
  <section v-if="message" class="operation-error" role="alert">
    <strong>操作失败</strong>
    <p>{{ summary }}</p>
    <details v-if="technical">
      <summary>查看技术详情</summary>
      <pre>{{ message }}</pre>
    </details>
  </section>
</template>
