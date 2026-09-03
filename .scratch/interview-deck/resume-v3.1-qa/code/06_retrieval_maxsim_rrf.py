"""
06_retrieval_maxsim_rrf.py — ColPali MaxSim 晚期交互与 RRF 多路召回融合白板代码

覆盖题目编号：
- C17: MaxSim late-interaction 晚期交互与两阶段检索 (maxsim_score, two_stage_retrieval)
- C18: RRF (Reciprocal Rank Fusion) 多路倒数排名融合 (reciprocal_rank_fusion)
"""

from __future__ import annotations

import math
from typing import Any


# ==============================================================================
# 极简向量计算辅助函数 (纯标准库，无 numpy / torch 依赖)
# ==============================================================================

def dot_product(u: list[float], v: list[float]) -> float:
    """计算两向量内积: sum(u_i * v_i)"""
    return sum(x * y for x, y in zip(u, v))


def l2_normalize(v: list[float], eps: float = 1e-12) -> list[float]:
    """L2 归一化，确保点积等价于余弦相似度"""
    norm = math.sqrt(sum(x * x for x in v))
    norm = max(norm, eps)
    return [x / norm for x in v]


# ==============================================================================
# C17: MaxSim Late-Interaction 与两阶段检索
# ==============================================================================

def maxsim_score(
    query_tokens: list[list[float]],
    doc_tokens: list[list[float]],
) -> float:
    # 考察点: ColPali/ColBERT Late-Interaction 晚期交互、逐 token 求最大相似度求和、纯 Python 模拟 einsum('qd,pd->qp').max(-1).sum()
    # 手写量级: 15 行 / 4 分钟
    # 常见追问: 为什么不用单一向量余弦相似度？MaxSim 相比全交叉注意力快在哪里？多向量存储如何压缩 (二值化/残差量化)？

    # 公式: MaxSim(Q, D) = sum_{i=1}^{|Q|} max_{j=1}^{|D|} (q_i · d_j)
    total_score = 0.0
    for q_vec in query_tokens:
        # 对当前 Query Token，在文档全部 Token (Patch) 中寻找最高匹配点积
        best_token_sim = max(dot_product(q_vec, d_vec) for d_vec in doc_tokens)  # max_{j} (q_i · d_j)
        total_score += best_token_sim  # sum_{i} max_sim
    return total_score


def batch_maxsim(
    query_tokens: list[list[float]],
    docs_tokens: list[list[list[float]]],
) -> list[float]:
    """批量计算多个候选文档的 MaxSim 分数"""
    return [maxsim_score(query_tokens, doc) for doc in docs_tokens]


def two_stage_retrieval(
    query_single_vec: list[float],
    query_token_vecs: list[list[float]],
    candidates: list[dict[str, Any]],
    top_k_rough: int = 4,
    top_n_rerank: int = 2,
) -> list[dict[str, Any]]:
    # 考察点: 两阶段检索工业架构、单向量粗筛召回削减计算量、多向量 MaxSim 晚期交互高精重排
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 粗召回单向量如何生成 (Mean Pooling vs CLS)？top_k 与 top_n 的截断比例如何设定？

    # 1. 第一阶段: 单向量粗召回 (基于稠密全局向量内积快速筛选候选)
    scored_rough: list[tuple[float, dict[str, Any]]] = []
    for cand in candidates:
        # 粗排打分: 单向量余弦相似度
        rough_score = dot_product(query_single_vec, cand["single_vec"])  # S_rough = q_mean · d_mean
        scored_rough.append((rough_score, cand))

    # 按粗排分数降序截取 Top-K
    scored_rough.sort(key=lambda x: x[0], reverse=True)
    top_k_candidates = [cand for _, cand in scored_rough[:top_k_rough]]

    # 2. 第二阶段: MaxSim 晚期交互精排重排
    reranked: list[tuple[float, dict[str, Any]]] = []
    for cand in top_k_candidates:
        # 精排打分: 多向量细粒度 token-to-patch 晚期交互
        fine_score = maxsim_score(query_token_vecs, cand["token_vecs"])  # S_fine = MaxSim(Q, D)
        reranked.append((fine_score, cand))

    # 按精排分数降序截取最终 Top-N
    reranked.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "doc_id": cand["doc_id"],
            "maxsim_score": score,
            "metadata": cand.get("metadata", {}),
        }
        for score, cand in reranked[:top_n_rerank]
    ]


# ==============================================================================
# C18: RRF (Reciprocal Rank Fusion) 多路倒数排名融合
# ==============================================================================

def reciprocal_rank_fusion(
    ranked_lists: list[list[str]],
    k: int = 60,
    weights: list[float] | None = None,
) -> list[tuple[str, float]]:
    # 考察点: RRF 倒数排名融合无量纲归一化、k=60 平滑常数设定、多路异构检索 (BM25 + 向量) 稳健打分
    # 手写量级: 15 行 / 3 分钟
    # 常见追问: 为什么按排名 (Rank) 而不是绝对分数 (Score) 融合？常数 k=60 解决什么问题？如何支持多路权重加权？

    # 公式: RRF_Score(d) = sum_{m in M} w_m / (k + rank_m(d))
    if weights is None:
        weights = [1.0] * len(ranked_lists)

    doc_scores: dict[str, float] = {}

    for ranked_list, w in zip(ranked_lists, weights):
        for rank_idx, doc_id in enumerate(ranked_list, start=1):  # 1-based rank
            # 倒数排名累加 (平滑常数 k 避免头部分数差距过大压制尾部)
            rrf_contrib = w / (k + rank_idx)  # contrib = w / (k + r)
            doc_scores[doc_id] = doc_scores.get(doc_id, 0.0) + rrf_contrib

    # 按融合总分降序排列
    sorted_docs = sorted(doc_scores.items(), key=lambda item: item[1], reverse=True)
    return sorted_docs


# ==============================================================================
# 自测断言 (__main__)
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 06_retrieval_maxsim_rrf.py 自测 ===")

    # 1. 测试 C17: MaxSim Late-Interaction 计算与单调性
    # 构造维度 d=3 的向量，已归一化
    v_a = l2_normalize([1.0, 0.0, 0.0])  # 概念 A
    v_b = l2_normalize([0.0, 1.0, 0.0])  # 概念 B
    v_c = l2_normalize([0.0, 0.0, 1.0])  # 概念 C
    v_mix = l2_normalize([0.7, 0.7, 0.0]) # 混合概念

    # Query 包含两个 token: [v_a, v_b]
    q_tokens = [v_a, v_b]

    # Doc 1: 包含完全匹配的 token [v_a, v_b] -> 每个 token 最大匹配度均为 1.0 -> MaxSim = 2.0
    doc_perfect = [v_a, v_b]
    score_perfect = maxsim_score(q_tokens, doc_perfect)
    assert math.isclose(score_perfect, 2.0, rel_tol=1e-5), f"完全匹配得分应为 2.0，实际 {score_perfect}"

    # Doc 2: 仅包含 [v_a, v_c] -> v_a 匹配 1.0, v_b 匹配 0.0 -> MaxSim = 1.0
    doc_partial = [v_a, v_c]
    score_partial = maxsim_score(q_tokens, doc_partial)
    assert math.isclose(score_partial, 1.0, rel_tol=1e-5)

    # Doc 3: 完全无关 [v_c, v_c] -> MaxSim = 0.0
    doc_irrelevant = [v_c, v_c]
    score_irrelevant = maxsim_score(q_tokens, doc_irrelevant)
    assert math.isclose(score_irrelevant, 0.0, rel_tol=1e-5)

    # 验证单调性: 完全匹配 > 部分匹配 > 无关
    assert score_perfect > score_partial > score_irrelevant
    print("✓ C17 MaxSim Late-Interaction 匹配与单调性测试通过")

    # 2. 测试 C17: 两阶段检索 (粗筛 + 精排)
    cand_db = [
        {
            "doc_id": "doc_01",
            "single_vec": l2_normalize([0.9, 0.1, 0.0]),
            "token_vecs": [v_a, v_b],  # 精排完全匹配
        },
        {
            "doc_id": "doc_02",
            "single_vec": l2_normalize([0.95, 0.0, 0.0]),  # 粗排单向量极高
            "token_vecs": [v_a, v_c],  # 但缺少 v_b
        },
        {
            "doc_id": "doc_03",
            "single_vec": l2_normalize([0.1, 0.8, 0.0]),
            "token_vecs": [v_b, v_c],
        },
        {
            "doc_id": "doc_04",
            "single_vec": l2_normalize([0.0, 0.0, 1.0]),  # 粗排垫底
            "token_vecs": [v_c, v_c],
        },
    ]

    q_single = l2_normalize([0.8, 0.2, 0.0])
    results = two_stage_retrieval(
        query_single_vec=q_single,
        query_token_vecs=q_tokens,
        candidates=cand_db,
        top_k_rough=3,
        top_n_rerank=2,
    )
    assert len(results) == 2
    # 验证经 MaxSim 精排后，包含 [v_a, v_b] 全 token 对齐的 doc_01 跃升为第一
    assert results[0]["doc_id"] == "doc_01", f"精排后首位应为 doc_01，实际为 {results[0]['doc_id']}"
    assert results[0]["maxsim_score"] > results[1]["maxsim_score"]
    print("✓ C17 两阶段检索 (粗筛 + MaxSim 精排) 测试通过")

    # 3. 测试 C18: RRF 融合与排序
    # 模拟两路检索: 路 1 为 BM25 关键词检索，路 2 为 Dense 向量检索
    bm25_ranking = ["doc_A", "doc_B", "doc_C"]
    dense_ranking = ["doc_B", "doc_A", "doc_D"]

    fused = reciprocal_rank_fusion([bm25_ranking, dense_ranking], k=60)
    # doc_A: rank 1 in BM25, rank 2 in Dense -> score = 1/(60+1) + 1/(60+2)
    # doc_B: rank 2 in BM25, rank 1 in Dense -> score = 1/(60+2) + 1/(60+1)
    # 两者分数并列且最高
    expected_score_top = 1.0 / 61.0 + 1.0 / 62.0
    fused_dict = dict(fused)
    assert math.isclose(fused_dict["doc_A"], expected_score_top, rel_tol=1e-5)
    assert math.isclose(fused_dict["doc_B"], expected_score_top, rel_tol=1e-5)

    # doc_C 与 doc_D 各只有单路命中，分数必须显著低于 doc_A / doc_B
    assert fused_dict["doc_A"] > fused_dict["doc_C"]
    assert fused_dict["doc_B"] > fused_dict["doc_D"]
    assert math.isclose(fused_dict["doc_C"], 1.0 / (60 + 3), rel_tol=1e-5)
    print("✓ C18 RRF 倒数排名融合测试通过")

    print("\n=== 06_retrieval_maxsim_rrf.py 全部断言自测通过！===")
