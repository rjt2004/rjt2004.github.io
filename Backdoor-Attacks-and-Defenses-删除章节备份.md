# 后门攻击文章 · 已删除章节备份

> 以下章节从 `source/_posts/Backdoor-Attacks-and-Defenses.md` 中移出（原第七、九、十节），仅作备份留存，不参与 Hexo 构建。

## 七、阅读近年顶会论文的思路

阅读后门论文时，可以按以下问题拆解：

1. **论文解决的是哪种模型或任务？** 图像分类、目标检测、LLM、扩散模型、多模态模型、联邦学习还是自监督预训练？
2. **攻击者能力是什么？** 能否改标签？能否控制训练？能否访问模型参数？是否知道防御方法？
3. **触发器是什么？** 固定、动态、语义、自然、隐式还是多模态？
4. **贡献点在哪里？** 更强攻击、更隐蔽触发器、更现实威胁模型、更可靠检测、更低成本修复，还是新基准？
5. **实验是否充分？** 是否覆盖多个数据集、模型架构、投毒率、目标类别和自适应攻击？
6. **与已有方法相比解决了什么缺点？** 是否只是换了触发器，还是改变了威胁模型或评估范式？

如果要做课程讲解，建议选择“威胁模型清晰、方法图好讲、实验指标完整、能联系大模型安全”的论文。

## 九、适合课程讲解的选题建议

如果课程希望你先讲清楚基础原理，再讲一篇近两年 CCF-A 顶会论文，可以优先考虑三类：

1. **偏防御、容易讲清流程**：Backdoor Defense via Test-Time Detecting and Repairing，CVPR 2024。优点是和传统图像后门衔接自然，指标清晰，适合入门讲解。
2. **偏大模型安全、选题更新且较容易复现**：BackdoorLLM，NeurIPS 2025；ICLScan，NeurIPS 2025。优点是和 LLM 安全评估联系紧密，实验叙事容易做成课程展示。
3. **偏模型供应链与多模态**：Stealthy Backdoor Attack in Self-Supervised Learning Vision Encoders for Large Vision Language Models，CVPR 2025。优点是能把迁移学习、预训练编码器和视觉语言模型串起来，和本文背景部分联系最紧。

如果只能选一篇，我更推荐 **BackdoorLLM** 或 **ICLScan**。前者更适合做体系化综述与评估，后者更适合做一个黑盒检测演示。如果老师更希望论文和经典后门攻击一脉相承，则选择 CVPR 2025 的自监督视觉编码器后门论文更顺。

### 顶会论文图片留位与来源建议

如果最后确定讲其中一篇论文，建议不要只放文字总结，至少加入“问题设定图、方法框架图、实验结果图”三类图。图片文件建议统一放在博客资源目录 `source/_posts/Backdoor-Attacks-and-Defenses/` 下，Markdown 中使用如下留位格式。

<img src="Backdoor-Attacks-and-Defenses/backdoorllm-benchmark.png" alt="BackdoorLLM 评测框架" style="width:60%; max-width:720px;">

图片建议：如果选择 BackdoorLLM，从 NeurIPS 2025 论文或项目页中找 benchmark overview、攻击/防御任务 taxonomy、整体实验流程图。

<img src="Backdoor-Attacks-and-Defenses/iclscan-framework.png" alt="ICLScan 黑盒检测框架" style="width:60%; max-width:720px;">

图片建议：如果选择 ICLScan，从论文中找 targeted in-context illumination 的方法框架图；这张图最适合解释“黑盒 LLM 为什么也能检测后门”。

<img src="Backdoor-Attacks-and-Defenses/lvlm-encoder-backdoor.png" alt="自监督视觉编码器后门攻击框架" style="width:60%; max-width:720px;">

图片建议：如果选择 CVPR 2025 的自监督视觉编码器后门论文，从论文中找“poisoned SSL vision encoder -> downstream LVLM behavior”的流程图，能很好衔接本文的迁移学习后门背景。

<img src="Backdoor-Attacks-and-Defenses/test-time-detect-repair.png" alt="测试时检测与修复后门防御框架" style="width:60%; max-width:720px;">

图片建议：如果选择 Backdoor Defense via Test-Time Detecting and Repairing，从 CVPR 2024 论文中找检测与修复 pipeline 图，并搭配 ASR/CA 对比表讲实验结果。

## 十、Zotero 导入清单

本节列出建议导入 Zotero 的条目。当前 Zotero 中已有 `Backdoor` 分类；经典攻击论文、经典防御论文和近年顶会候选可以分别使用 `classic-attack`、`classic-defense`、`ccf-a-candidate`、`defense`、`attack`、`llm`、`cvpr-2025` 等标签管理。

| 条目 | DOI / URL |
| --- | --- |
| BadNets: Evaluating Backdooring Attacks on Deep Neural Networks | https://doi.org/10.1109/ACCESS.2019.2909068 |
| Targeted Backdoor Attacks on Deep Learning Systems Using Data Poisoning | https://arxiv.org/abs/1712.05526 |
| Clean-label Backdoor Attacks | https://openreview.net/forum?id=HJg6e2CcK7 |
| Input-aware Dynamic Backdoor Attack | https://papers.neurips.cc/paper/2020/hash/234e691320c0ad5b45ee3c96d0d7b8f8-Abstract.html |
| Hidden Trigger Backdoor Attacks | https://ojs.aaai.org/index.php/AAAI/article/view/6871 |
| Latent Backdoor Attacks on Deep Neural Networks | https://doi.org/10.1145/3319535.3354209 |
| Neural Cleanse: Identifying and Mitigating Backdoor Attacks in Neural Networks | https://doi.org/10.1109/SP.2019.00031 |
| Fine-Pruning: Defending Against Backdooring Attacks on Deep Neural Networks | https://arxiv.org/abs/1805.12185 |
| Spectral Signatures in Backdoor Attacks | https://papers.neurips.cc/paper/8024-spectral-signatures-in-backdoor-attacks |
| STRIP: A Defence Against Trojan Attacks on Deep Neural Networks | https://arxiv.org/abs/1902.06531 |
| ABS: Scanning Neural Networks for Back-doors by Artificial Brain Stimulation | https://doi.org/10.1145/3319535.3363216 |
| Anti-Backdoor Learning: Training Clean Models on Poisoned Data | https://proceedings.neurips.cc/paper/2021/hash/7d38b1e9bd793d3f45e0e212a729a93c-Abstract.html |
| Backdoor Defense via Test-Time Detecting and Repairing | https://openaccess.thecvf.com/content/CVPR2024/html/Guan_Backdoor_Defense_via_Test-Time_Detecting_and_Repairing_CVPR_2024_paper.html |
| BackdoorLLM: A Comprehensive Benchmark for Backdoor Attacks and Defenses on Large Language Models | https://papers.neurips.cc/paper_files/paper/2025/hash/20ffc2b42c7de4a1960cfdadf305bbe2-Abstract-Datasets_and_Benchmarks_Track.html |
| ICLScan: Detecting Backdoors in Black-Box Large Language Models via Targeted In-context Illumination | https://proceedings.neurips.cc/paper_files/paper/2025/hash/db86e1a6a6182687a4c500078c4912ff-Abstract-Conference.html |
| RepGuard: Adaptive Feature Decoupling for Robust Backdoor Defense in Large Language Models | https://proceedings.neurips.cc/paper_files/paper/2025/hash/3f80233900d303acb23b2b807efbddcf-Abstract-Conference.html |
